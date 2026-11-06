import { assert, describe, layer } from '@effect/vitest'
import { S3Service } from '@effect-aws/client-s3'
import { Array as Arr, Effect, Layer, Option, Stream, Struct } from 'effect'

import { buildResourceName, resources } from '@app-template/kernel/aws'
import { AwsTest } from '@app-template/kernel/aws/testing/e2e'
import { AwsConfig } from '@app-template/kernel/config'
import { png } from '@app-template/packages/testing'

import { FileRepository } from '#kernel/data/file/file.repository'

const fileId = (n: number) => `0192d4e0-7b3a-7c00-8000-${String(n).padStart(12, '0')}`

const unknownId = '0192d4e0-7b3a-7c00-8000-000000000029'

const file = (id: string) => ({
  id,
  content: Stream.make(png),
  mediaType: 'image/png',
  fileName: 'отчёт (1).png',
})

describe('FileRepository on AwsTest', () => {
  // One stage for the file's `layer` block: each test writes an id of its own.
  layer(FileRepository.layer.pipe(Layer.provideMerge(AwsTest)), { timeout: '60 seconds' })((it) => {
    it.effect(
      'insert writes the bytes under attachments/<id> with the media type and an inline disposition that carries the UTF-8 file name',
      () =>
        Effect.gen(function* () {
          const files = yield* FileRepository
          const s3 = yield* S3Service
          const { stage } = yield* AwsConfig
          const id = fileId(1)

          const size = yield* files.insert(file(id))
          const head = yield* s3.headObject({
            Bucket: buildResourceName(stage, resources.buckets.attachments.name),
            Key: `attachments/${id}`,
          })

          assert.strictEqual(size, png.length)
          assert.strictEqual(head.ContentType, 'image/png')
          assert.strictEqual(
            head.ContentDisposition,
            "inline; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82%20%281%29.png",
          )
        }),
    )

    it.effect('insert tags a small upload unbound', () =>
      Effect.gen(function* () {
        const files = yield* FileRepository
        const s3 = yield* S3Service
        const { stage } = yield* AwsConfig
        const id = fileId(2)

        yield* files.insert(file(id))
        const { TagSet } = yield* s3.getObjectTagging({
          Bucket: buildResourceName(stage, resources.buckets.attachments.name),
          Key: `attachments/${id}`,
        })

        assert.deepStrictEqual(TagSet, [{ Key: 'unbound', Value: 'true' }])
      }),
    )

    it.effect('update to bound removes the unbound tag from every file it names', () =>
      Effect.gen(function* () {
        const files = yield* FileRepository
        const s3 = yield* S3Service
        const { stage } = yield* AwsConfig
        const ids = [fileId(3), fileId(10)]
        yield* Effect.forEach(ids, (id) => files.insert(file(id)))

        yield* files.update({ bound: true }, { id: ids })
        const tagSets = yield* Effect.forEach(ids, (id) =>
          s3.getObjectTagging({
            Bucket: buildResourceName(stage, resources.buckets.attachments.name),
            Key: `attachments/${id}`,
          }),
        )

        assert.deepStrictEqual(Arr.map(tagSets, Struct.get('TagSet')), [[], []])
      }),
    )

    it.effect("selectOne signs a URL that serves attachments/<id> from the endpoint's host", () =>
      Effect.gen(function* () {
        const files = yield* FileRepository
        const { endpoint } = yield* AwsConfig
        const id = fileId(4)
        yield* files.insert(file(id))

        const { url } = yield* files.selectOne({ id }).pipe(Effect.flatMap(Effect.fromOption))

        assert.strictEqual(url.host, Option.getOrThrow(endpoint).host)
        assert.isTrue(url.pathname.endsWith(`/attachments/${id}`))
      }),
    )

    it.effect(
      'selectMany answers the stored files in the order asked with their media type and file name, leaving out a missing id',
      () =>
        Effect.gen(function* () {
          const files = yield* FileRepository
          const first = fileId(9)
          const second = fileId(7)
          yield* files.insert(file(second))
          yield* files.insert(file(first))

          const found = yield* files.selectMany({ id: [first, unknownId, second] })

          assert.deepStrictEqual(
            Arr.map(found, (stored) => Struct.omit(stored, ['url'])),
            [
              { id: first, mediaType: 'image/png', fileName: 'отчёт (1).png' },
              { id: second, mediaType: 'image/png', fileName: 'отчёт (1).png' },
            ],
          )
        }),
    )

    it.effect('download answers the file with its bytes, and none for a missing id', () =>
      Effect.gen(function* () {
        const files = yield* FileRepository
        const id = fileId(8)
        yield* files.insert(file(id))

        const found = yield* files.download({ id }).pipe(Effect.flatMap(Effect.fromOption))
        const missing = yield* files.download({ id: unknownId })

        assert.deepStrictEqual(Struct.omit(found, ['url']), {
          id,
          mediaType: 'image/png',
          fileName: 'отчёт (1).png',
          blob: png,
        })
        assert.deepStrictEqual(missing, Option.none())
      }),
    )

    it.effect('selectOne of a missing id is none', () =>
      Effect.gen(function* () {
        const files = yield* FileRepository

        const found = yield* files.selectOne({ id: unknownId })

        assert.deepStrictEqual(found, Option.none())
      }),
    )

    it.effect('delete removes every file it names and skips a missing id', () =>
      Effect.gen(function* () {
        const files = yield* FileRepository
        const first = fileId(5)
        const second = fileId(6)
        yield* files.insert(file(first))
        yield* files.insert(file(second))

        yield* files.delete({ id: [first, second, unknownId] })
        const found = yield* Effect.all([
          files.selectOne({ id: first }),
          files.selectOne({ id: second }),
        ])

        assert.deepStrictEqual(found, [Option.none(), Option.none()])
      }),
    )
  })
})
