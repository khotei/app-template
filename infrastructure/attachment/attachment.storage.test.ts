import { assert, describe, layer } from '@effect/vitest'
import { Data, Effect, Layer, Option, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  AttachmentId,
  AttachmentStore,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'

import { AttachmentStoreKv } from '#infrastructure/attachment/attachment.storage'

class UploadBrokenError extends Data.TaggedError('UploadBrokenError') {}

const id = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000020')
const unknown = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')
const photo = { mediaType: MediaType.make('image/png'), fileName: FileName.make('photo.png') }

/** A PNG signature followed by a zero and a 0xff byte, so a text round trip would corrupt it. */
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])

const inTwoChunks = (bytes: Uint8Array) => Stream.make(bytes.subarray(0, 4), bytes.subarray(4))

const failingAfterFirstChunk = (error: UploadBrokenError) =>
  Stream.concat(Stream.make(png.subarray(0, 4)), Stream.fail(error))

const fetchUrl = (url: URL) =>
  Effect.promise(async () => {
    const response = await fetch(url)
    return {
      contentType: response.headers.get('content-type'),
      bytes: new Uint8Array(await response.arrayBuffer()),
    }
  })

describe.each([
  {
    name: 'AttachmentStoreKv',
    store: AttachmentStoreKv.pipe(Layer.provide(KeyValueStore.layerMemory)),
  },
])('$name', ({ store }) => {
  layer(store)((it) => {
    it.effect('insert returns the size of the streamed bytes, and select returns them', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore

        const size = yield* attachments.insert(id, inTwoChunks(png), photo)

        assert.strictEqual(size, FileSize.make(png.length))
        assert.deepStrictEqual(yield* attachments.select(id), Option.some(png))
      }),
    )

    it.effect('url serves the bytes with the media type', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        yield* attachments.insert(id, inTwoChunks(png), photo)

        const url = yield* attachments.url(id)

        assert.deepStrictEqual(yield* fetchUrl(url), { contentType: 'image/png', bytes: png })
      }),
    )

    it.effect('a stream failing part-way fails insert with its error and stores nothing', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        const broken = new UploadBrokenError()

        const error = yield* Effect.flip(
          attachments.insert(unknown, failingAfterFirstChunk(broken), photo),
        )

        assert.strictEqual(error, broken)
        assert.deepStrictEqual(yield* attachments.select(unknown), Option.none())
      }),
    )

    it.effect('delete removes the bytes and succeeds again on a deleted id', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        yield* attachments.insert(id, inTwoChunks(png), photo)

        yield* attachments.delete(id)
        yield* attachments.delete(id)

        assert.deepStrictEqual(yield* attachments.select(id), Option.none())
      }),
    )

    it.effect('keep leaves the bytes in place', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        yield* attachments.insert(id, inTwoChunks(png), photo)

        yield* attachments.keep(id)

        assert.deepStrictEqual(yield* attachments.select(id), Option.some(png))
      }),
    )

    it.effect('select is none for bytes never stored', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore

        assert.deepStrictEqual(yield* attachments.select(unknown), Option.none())
      }),
    )
  })
})
