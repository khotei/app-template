import { assert, describe, layer } from '@effect/vitest'
import { S3Service } from '@effect-aws/client-s3'
import { Effect, Layer, Option, Stream } from 'effect'

import { buildResourceName, resources } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import {
  AttachmentBucket,
  AttachmentId,
  FileName,
  MediaType,
} from '@app-template/domain/attachment'
import { unknownAttachmentId } from '@app-template/domain/testing'
import { png } from '@app-template/testing'

import { AttachmentBucketS3 } from '#infrastructure/attachment/attachment.bucket'
import { S3BucketFromConfig } from '#infrastructure/shared/aws.client'
import { AwsTest } from '#infrastructure/testing/aws.test-layer'

// One stage for the file's `layer` block: each test writes an id of its own.
const AttachmentBucketS3Test = AttachmentBucketS3.pipe(
  Layer.provide(S3BucketFromConfig),
  Layer.provideMerge(AwsTest),
)

const attachmentId = (n: number) =>
  AttachmentId.make(`0192d4e0-7b3a-7c00-8000-${String(n).padStart(12, '0')}`)

const meta = {
  mediaType: MediaType.make('image/png'),
  fileName: FileName.make('отчёт (1).png'),
}

const buildObjectRef = (key: string) =>
  Effect.map(AwsConfig, ({ stage }) => ({
    Bucket: buildResourceName(stage, resources.buckets.attachments.name),
    Key: key,
  }))

const headObject = (key: string) =>
  Effect.gen(function* () {
    const s3 = yield* S3Service
    const ref = yield* buildObjectRef(key)
    return yield* s3.headObject(ref)
  })

const readTags = (key: string) =>
  Effect.gen(function* () {
    const s3 = yield* S3Service
    const ref = yield* buildObjectRef(key)
    const { TagSet } = yield* s3.getObjectTagging(ref)
    return TagSet
  })

describe('AttachmentBucketS3 over S3BucketFromConfig on AwsTest', () => {
  layer(AttachmentBucketS3Test, { timeout: '60 seconds' })((it) => {
    it.effect(
      'writes the bytes under attachments/<id> with the media type and an inline disposition that carries the UTF-8 file name',
      () =>
        Effect.gen(function* () {
          const bucket = yield* AttachmentBucket
          const id = attachmentId(1)

          const size = yield* bucket.insert(id, Stream.make(png), meta)
          const head = yield* headObject(`attachments/${id}`)

          assert.strictEqual(size, png.length)
          assert.strictEqual(head.ContentType, 'image/png')
          assert.strictEqual(
            head.ContentDisposition,
            "inline; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82%20%281%29.png",
          )
        }),
    )

    it.effect('marks a small upload unbound', () =>
      Effect.gen(function* () {
        const bucket = yield* AttachmentBucket
        const id = attachmentId(2)

        yield* bucket.insert(id, Stream.make(png), meta)
        const tags = yield* readTags(`attachments/${id}`)

        assert.deepStrictEqual(tags, [{ Key: 'unbound', Value: 'true' }])
      }),
    )

    it.effect('keep clears the unbound mark', () =>
      Effect.gen(function* () {
        const bucket = yield* AttachmentBucket
        const id = attachmentId(3)
        yield* bucket.insert(id, Stream.make(png), meta)

        yield* bucket.keep(id)
        const tags = yield* readTags(`attachments/${id}`)

        assert.deepStrictEqual(tags, [])
      }),
    )

    it.effect("url is a presigned GET on the endpoint's host", () =>
      Effect.gen(function* () {
        const bucket = yield* AttachmentBucket
        const { endpoint } = yield* AwsConfig
        const id = attachmentId(4)
        yield* bucket.insert(id, Stream.make(png), meta)

        const url = yield* bucket.url(id).pipe(Effect.flatMap(Effect.fromOption))

        assert.strictEqual(url.host, Option.getOrThrow(endpoint).host)
        assert.isTrue(url.pathname.endsWith(`/attachments/${id}`))
        assert.isTrue(url.searchParams.has('X-Amz-Signature'))
      }),
    )

    it.effect('select of a missing id is none', () =>
      Effect.gen(function* () {
        const bucket = yield* AttachmentBucket

        const found = yield* bucket.select(unknownAttachmentId)

        assert.deepStrictEqual(found, Option.none())
      }),
    )
  })
})
