import { assert, describe, layer, type Vitest } from '@effect/vitest'
import { S3Service } from '@effect-aws/client-s3'
import {
  Array as Arr,
  Clock,
  ConfigProvider,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Stream,
} from 'effect'
import { FetchHttpClient, HttpClient } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'

import { buildResourceName, provision, resources } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import {
  AttachmentId,
  AttachmentStore,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  AwsClientsMiniStack,
  breakAfter,
  buildStage,
  png,
  StreamBrokenError,
} from '@app-template/testing'

import {
  AttachmentStoreKv,
  AttachmentStoreS3,
  buildObjectKey,
} from '#infrastructure/attachment/attachment.storage'

const id = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000020')
const unknown = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')
const photo = { mediaType: MediaType.make('image/png'), fileName: FileName.make('photo.png') }

const buildChunkedStream = (bytes: Uint8Array, chunkSize: number) =>
  Stream.fromIterable(
    Arr.makeBy(Math.ceil(bytes.length / chunkSize), (index) =>
      bytes.subarray(index * chunkSize, (index + 1) * chunkSize),
    ),
  )

const fetchUrl = Effect.fnUntraced(function* (url: Option.Option<URL>) {
  const found = yield* Effect.fromOption(url)
  const response = yield* HttpClient.get(found)
  const body = yield* response.arrayBuffer
  return {
    status: response.status,
    contentType: response.headers['content-type'],
    contentDisposition: response.headers['content-disposition'],
    bytes: new Uint8Array(body),
  }
}, Effect.provide(FetchHttpClient.layer))

/** Sets the test clock to the wall clock minus `ago`: an S3 URL is signed at the clock's time. */
const setClockAgo = (ago: Duration.Input) =>
  TestClock.withLive(Clock.currentTimeMillis).pipe(
    Effect.flatMap((now) => TestClock.setTime(now - Duration.toMillis(ago))),
  )

const runContractSuite = (it: Vitest.MethodsNonLive<AttachmentStore>) => {
  it.effect('insert returns the size of the streamed bytes, and select returns them', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentStore

      const size = yield* attachments.insert(id, buildChunkedStream(png, 4), photo)

      assert.strictEqual(size, FileSize.make(png.length))
      assert.deepStrictEqual(yield* attachments.select(id), Option.some(png))
    }),
  )

  it.effect('url serves the bytes with the media type', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentStore
      yield* attachments.insert(id, buildChunkedStream(png, 4), photo)
      yield* setClockAgo(Duration.zero)

      const url = yield* attachments.url(id)

      const { contentType, bytes } = yield* fetchUrl(url)
      assert.deepStrictEqual({ contentType, bytes }, { contentType: 'image/png', bytes: png })
    }),
  )

  it.effect('a stream failing part-way fails insert with its error and stores nothing', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentStore
      const broken = new StreamBrokenError()

      const error = yield* Effect.flip(
        attachments.insert(unknown, breakAfter([png.subarray(0, 4)], broken), photo),
      )

      assert.strictEqual(error, broken)
      assert.deepStrictEqual(yield* attachments.select(unknown), Option.none())
    }),
  )

  it.effect('delete removes the bytes and succeeds again on a deleted id', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentStore
      yield* attachments.insert(id, buildChunkedStream(png, 4), photo)

      yield* attachments.delete(id)
      yield* attachments.delete(id)

      assert.deepStrictEqual(yield* attachments.select(id), Option.none())
    }),
  )

  it.effect('keep leaves the bytes in place', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentStore
      yield* attachments.insert(id, buildChunkedStream(png, 4), photo)

      yield* attachments.keep(id)
      yield* attachments.keep(id)

      assert.deepStrictEqual(yield* attachments.select(id), Option.some(png))
    }),
  )

  it.effect('select and url are none and keep succeeds for bytes never stored', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentStore

      yield* attachments.keep(unknown)

      assert.deepStrictEqual(yield* attachments.select(unknown), Option.none())
      assert.deepStrictEqual(yield* attachments.url(unknown), Option.none())
    }),
  )
}

describe('AttachmentStoreKv', () => {
  layer(AttachmentStoreKv.pipe(Layer.provide(KeyValueStore.layerMemory)))((it) => {
    runContractSuite(it)
  })
})

const stage = buildStage()
const bucket = buildResourceName(stage, resources.buckets.attachments.name)
const buildObjectRef = (attachmentId: AttachmentId) => ({
  Bucket: bucket,
  Key: buildObjectKey(attachmentId),
})

const buildMebibytes = (count: number) => new Uint8Array(count * 1024 * 1024).map((_, i) => i % 251)
const tenMebibytes = buildMebibytes(10)
/** Small chunks, so no single buffer of the file's size ever reaches the store. */
const tenMebibytesStream = buildChunkedStream(tenMebibytes, 64 * 1024)

const AwsConfigTest = AwsConfig.layer.pipe(
  Layer.provide(
    ConfigProvider.layer(ConfigProvider.fromUnknown({ AWS_REGION: 'us-east-1', STAGE: stage })),
  ),
)

const AttachmentStoreS3MiniStack = Layer.mergeAll(
  AttachmentStoreS3,
  Layer.effectDiscard(provision(resources, stage)),
).pipe(Layer.provide(AwsConfigTest), Layer.provideMerge(AwsClientsMiniStack))

const listLeftovers = Effect.fnUntraced(function* (attachmentId: AttachmentId) {
  const s3 = yield* S3Service
  const { Bucket, Key } = buildObjectRef(attachmentId)
  const objects = yield* s3.listObjectsV2({ Bucket, Prefix: Key })
  const uploads = yield* s3.listMultipartUploads({ Bucket, Prefix: Key })
  return { objects: objects.Contents ?? [], uploads: uploads.Uploads ?? [] }
})

const readTags = Effect.fnUntraced(function* (attachmentId: AttachmentId) {
  const s3 = yield* S3Service
  const { TagSet } = yield* s3.getObjectTagging(buildObjectRef(attachmentId))
  return TagSet ?? []
})

describe('AttachmentStoreS3', () => {
  layer(AttachmentStoreS3MiniStack, { timeout: '60 seconds' })((it) => {
    runContractSuite(it)

    it.effect('10 MiB in 64 KiB chunks are stored by a two-part upload with the same bytes', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        const s3 = yield* S3Service

        const size = yield* attachments.insert(id, tenMebibytesStream, photo)

        const { ETag } = yield* s3.headObject(buildObjectRef(id))
        assert.strictEqual(size, FileSize.make(tenMebibytes.length))
        assert.match(ETag ?? '', /-2"$/)
        assert.deepStrictEqual(yield* attachments.select(id), Option.some(tenMebibytes))
      }),
    )

    it.effect('a stream failing after the first part leaves no object and no upload', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        const broken = new StreamBrokenError()

        const error = yield* Effect.flip(
          attachments.insert(unknown, breakAfter([buildMebibytes(6)], broken), photo),
        )

        assert.strictEqual(error, broken)
        assert.deepStrictEqual(yield* listLeftovers(unknown), { objects: [], uploads: [] })
      }),
    )

    it.effect('an insert interrupted after the first part leaves no object and no upload', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        const firstPartSent = yield* Deferred.make<void>()
        const stalled = Stream.make(buildMebibytes(6)).pipe(
          Stream.concat(
            Stream.drain(Stream.fromEffect(Deferred.succeed(firstPartSent, undefined))),
          ),
          Stream.concat(Stream.never),
        )

        const fiber = yield* Effect.forkChild(attachments.insert(unknown, stalled, photo))
        yield* Deferred.await(firstPartSent)
        yield* Fiber.interrupt(fiber)

        assert.deepStrictEqual(yield* listLeftovers(unknown), { objects: [], uploads: [] })
      }),
    )

    it.effect('insert by a single put marks the object unbound, and keep clears it', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        yield* attachments.insert(id, Stream.make(png), photo)

        const inserted = yield* readTags(id)
        yield* attachments.keep(id)

        assert.deepStrictEqual(inserted, [{ Key: 'unbound', Value: 'true' }])
        assert.deepStrictEqual(yield* readTags(id), [])
      }),
    )

    it.effect('url serves the bytes inline under the percent-encoded file name', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        const report = { mediaType: photo.mediaType, fileName: FileName.make('отчёт (1).png') }
        yield* attachments.insert(id, Stream.make(png), report)
        yield* setClockAgo(Duration.zero)

        const url = yield* attachments.url(id)

        const { contentDisposition } = yield* fetchUrl(url)
        assert.strictEqual(
          contentDisposition,
          "inline; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82%20%281%29.png",
        )
      }),
    )

    it.effect.each([
      { seconds: 290, status: 200 },
      { seconds: 310, status: 403 },
    ])('a URL signed $seconds s ago answers $status', ({ seconds, status }) =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentStore
        yield* attachments.insert(id, Stream.make(png), photo)
        yield* setClockAgo(Duration.seconds(seconds))

        const url = yield* attachments.url(id)

        const response = yield* fetchUrl(url)
        assert.strictEqual(response.status, status)
      }),
    )
  })
})
