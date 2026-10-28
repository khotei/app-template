import { assert, describe, layer } from '@effect/vitest'
import { S3Service } from '@effect-aws/client-s3'
import { Array as Arr, Bytes, Duration, Effect, Layer, Option, Stream } from 'effect'

import { breakAfter, generateStage, S3ClientTest, StreamBrokenError } from '@app-template/testing'

import { S3Bucket } from '#s3/bucket'

const mebibyte = 1024 * 1024
const partSize = 5 * mebibyte

// One bucket for the file's `layer` block, named as a stage is: its objects are its own.
const bucket = generateStage()

const S3BucketTest = S3Bucket.layer({ bucket }).pipe(
  Layer.provide(
    Layer.effectDiscard(Effect.flatMap(S3Service, (s3) => s3.createBucket({ Bucket: bucket }))),
  ),
  Layer.provideMerge(S3ClientTest),
)

const buildContent = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  for (let i = 0; i < size; i++) bytes[i] = i % 251
  return bytes
}

/** Chunks of a mebibyte, as a request body arrives, so a part is cut from several of them. */
const chunk = (bytes: Uint8Array): ReadonlyArray<Uint8Array> =>
  Arr.makeBy(Math.ceil(bytes.length / mebibyte), (index) =>
    bytes.subarray(index * mebibyte, (index + 1) * mebibyte),
  )

const octetStream = { contentType: 'application/octet-stream' } as const

const readParts = (key: string) =>
  Effect.flatMap(S3Service, (s3) =>
    s3.getObjectAttributes({ Bucket: bucket, Key: key, ObjectAttributes: ['ETag', 'ObjectParts'] }),
  ).pipe(
    Effect.map(({ ETag, ObjectParts }) => ({
      etag: ETag ?? '',
      parts: Option.fromNullishOr(ObjectParts?.TotalPartsCount),
    })),
  )

const upload = 30_000

describe('S3Bucket over S3ClientTest against MiniStack', () => {
  layer(S3BucketTest, { timeout: '60 seconds' })((it) => {
    it.effect.each([
      { name: '0 bytes', key: 'empty', size: 0, parts: Option.none(), etag: /^[0-9a-f]{32}$/ },
      {
        name: 'exactly 5 MiB',
        key: 'one-part',
        size: partSize,
        parts: Option.none(),
        etag: /^[0-9a-f]{32}$/,
      },
      {
        name: '5 MiB + 1',
        key: 'two-parts',
        size: partSize + 1,
        parts: Option.some(2),
        etag: /^[0-9a-f]{32}-2$/,
      },
      {
        name: '12 MiB',
        key: 'three-parts',
        size: 12 * mebibyte,
        parts: Option.some(3),
        etag: /^[0-9a-f]{32}-3$/,
      },
    ])(
      'puts $name and reads it back',
      ({ key, size, parts, etag }) =>
        Effect.gen(function* () {
          const files = yield* S3Bucket
          const content = buildContent(size)

          const written = yield* files.put(key, Stream.fromIterable(chunk(content)), octetStream)
          const read = yield* files.get(key)
          const stored = yield* readParts(key)

          assert.strictEqual(written, size)
          assert.isTrue(Option.isSome(read))
          assert.isTrue(
            Bytes.Equivalence(
              Option.getOrElse(read, () => new Uint8Array()),
              content,
            ),
          )
          assert.deepStrictEqual(stored.parts, parts)
          assert.match(stored.etag, etag)
        }),
      upload,
    )

    it.effect(
      'aborts the upload of a stream that fails after a part is sent, leaving no object',
      () =>
        Effect.gen(function* () {
          const s3 = yield* S3Service
          const files = yield* S3Bucket
          const error = new StreamBrokenError()
          // A part is sent once the part after it is cut, so the first `UploadPart` is on the
          // wire at 10 MiB and the failure finds the multipart upload open.
          const content = breakAfter(chunk(buildContent(11 * mebibyte)), error)

          const failed = yield* files.put('broken', content, octetStream).pipe(Effect.flip)
          const exists = yield* files.exists('broken')
          const { Uploads } = yield* s3.listMultipartUploads({ Bucket: bucket, Prefix: 'broken' })

          assert.strictEqual(failed, error)
          assert.isFalse(exists)
          assert.deepStrictEqual(Uploads ?? [], [])
        }),
      upload,
    )

    it.effect('answers none, false, void and void for a missing key', () =>
      Effect.gen(function* () {
        const files = yield* S3Bucket

        const url = yield* files.url('missing', Duration.minutes(5))
        const exists = yield* files.exists('missing')
        yield* files.untag('missing')
        yield* files.delete('missing')

        assert.deepStrictEqual(url, Option.none())
        assert.isFalse(exists)
      }),
    )
  })
})
