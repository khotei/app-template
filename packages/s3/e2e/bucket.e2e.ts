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
  Layer.provide(Layer.effectDiscard(S3Service.use((s3) => s3.createBucket({ Bucket: bucket })))),
  Layer.provide(S3ClientTest),
)

// Not `Arr.makeBy`: it answers at least one element, and the 0-byte case needs none.
const buildContent = (size: number): Uint8Array =>
  new Uint8Array(size).map((_, index) => index % 251)

/** Chunks of a mebibyte, as a request body arrives, so a part is cut from several of them. */
const splitIntoMebibytes = (bytes: Uint8Array): ReadonlyArray<Uint8Array> =>
  Arr.makeBy(Math.ceil(bytes.length / mebibyte), (index) =>
    bytes.subarray(index * mebibyte, (index + 1) * mebibyte),
  )

const octetStream = { contentType: 'application/octet-stream' } as const

/** None for an object written with one `PutObject`. */
const readPartCount = (key: string) =>
  S3Service.use((s3) =>
    s3.getObjectAttributes({ Bucket: bucket, Key: key, ObjectAttributes: ['ObjectParts'] }),
  ).pipe(Effect.map(({ ObjectParts }) => Option.fromNullishOr(ObjectParts?.TotalPartsCount)))

const uploadTimeout = 30_000

describe('S3Bucket over S3ClientTest against MiniStack', () => {
  layer(Layer.merge(S3BucketTest, S3ClientTest), { timeout: '60 seconds' })((it) => {
    it.effect.each([
      { name: '0 bytes', key: 'empty', size: 0, parts: Option.none() },
      { name: 'exactly 5 MiB', key: 'one-part', size: partSize, parts: Option.none() },
      { name: '5 MiB + 1', key: 'two-parts', size: partSize + 1, parts: Option.some(2) },
      { name: '12 MiB', key: 'three-parts', size: 12 * mebibyte, parts: Option.some(3) },
    ])(
      'puts $name and reads it back',
      ({ key, size, parts }) =>
        Effect.gen(function* () {
          const files = yield* S3Bucket
          const content = buildContent(size)

          const written = yield* files.put(
            key,
            Stream.fromIterable(splitIntoMebibytes(content)),
            octetStream,
          )
          const read = yield* files.get(key)
          const stored = yield* readPartCount(key)

          assert.strictEqual(written, size)
          assert.isTrue(Option.isSome(read))
          assert.isTrue(
            Bytes.Equivalence(
              Option.getOrElse(read, () => new Uint8Array()),
              content,
            ),
          )
          assert.deepStrictEqual(stored, parts)
        }),
      uploadTimeout,
    )

    // A part is sent once the part after it is cut, and a failure still emits the part being cut.
    // At 11 MiB the failure finds the multipart upload open. At exactly 5 MiB one whole part is
    // held and none sent, so a put that took the failure for the end would store it alone.
    it.effect.each([
      { name: 'after a part is sent', key: 'broken-multipart', size: 11 * mebibyte },
      { name: 'after one whole part', key: 'broken-single', size: partSize },
    ])(
      'fails the put of a stream that breaks $name, leaving no object',
      ({ key, size }) =>
        Effect.gen(function* () {
          const s3 = yield* S3Service
          const files = yield* S3Bucket
          const error = new StreamBrokenError()
          const content = breakAfter(splitIntoMebibytes(buildContent(size)), error)

          const failed = yield* files.put(key, content, octetStream).pipe(Effect.flip)
          const exists = yield* files.exists(key)
          const { Uploads } = yield* s3.listMultipartUploads({ Bucket: bucket, Prefix: key })

          assert.strictEqual(failed, error)
          assert.isFalse(exists)
          assert.deepStrictEqual(Uploads ?? [], [])
        }),
      uploadTimeout,
    )

    it.effect(
      'deleteMany removes the keys asked for, skips a missing one, and keeps the rest',
      () =>
        Effect.gen(function* () {
          const files = yield* S3Bucket
          const put = (key: string) => files.put(key, Stream.make(buildContent(1)), octetStream)
          yield* Effect.forEach(['drop-1', 'drop-2', 'keep'], put, { discard: true })

          yield* files.deleteMany(['drop-1', 'drop-2', 'missing'])
          yield* files.deleteMany([])

          const exist = yield* Effect.forEach(['drop-1', 'drop-2', 'keep'], files.exists)
          assert.deepStrictEqual(exist, [false, false, true])
        }),
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
