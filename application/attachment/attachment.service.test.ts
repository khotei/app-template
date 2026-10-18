import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, layer } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { TestClock, TestCrypto } from 'effect/testing'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentId,
  AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { MessageId } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryKv, AttachmentStoreKv } from '@app-template/infrastructure/attachment'

import { AttachmentService } from '#application/attachment/attachment.service'

const AttachmentServiceTest = AttachmentService.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(AttachmentRepositoryKv, AttachmentStoreKv)),
  Layer.provide(TestCrypto.layer('attachment-service').pipe(Layer.provide(BunCrypto.layer))),
  Layer.provide(KeyValueStore.layerMemory),
)

const isUuidV7 = Schema.is(Schema.String.check(Schema.isUUID(7)))

const owner = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
const stranger = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])
const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

const uploadPhoto = Effect.flatMap(AttachmentService, (service) =>
  service.upload(owner, { ...photo, bytes: png }),
)

type Read = (userId: UserId, id: AttachmentId) => Effect.Effect<unknown, AttachmentNotFoundError>

const pickReader = (service: AttachmentService['Service'], method: 'get' | 'download'): Read =>
  ({ get: service.get, download: service.download })[method]

const bind = (attachment: Attachment) =>
  Effect.flatMap(AttachmentRepository, (attachments) =>
    attachments.update(
      new Attachment({
        ...attachment,
        messageId: Option.some(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')),
      }),
    ),
  )

describe('AttachmentService', () => {
  layer(AttachmentServiceTest)((it) => {
    it.effect('upload stores the bytes and the metadata of an unbound attachment', () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const now = DateTime.makeUnsafe('2026-10-18T12:00:00.000Z')
        yield* TestClock.setTime(DateTime.toEpochMillis(now))

        const attachment = yield* uploadPhoto

        assert.isTrue(isUuidV7(attachment.id))
        assertEquals(
          attachment,
          buildAttachment({
            ...photo,
            id: attachment.id,
            userId: owner,
            size: FileSize.make(png.length),
            createdAt: now,
          }),
        )
        assertEquals(yield* service.get(owner, attachment.id), attachment)
        assertEquals(yield* service.download(owner, attachment.id), { attachment, bytes: png })
      }),
    )

    it.effect.each(['get', 'download'] as const)(
      "%s of another user's id or of an unknown id is AttachmentNotFoundError",
      (method) =>
        Effect.gen(function* () {
          const read = pickReader(yield* AttachmentService, method)
          const attachment = yield* uploadPhoto
          const unknown = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

          const foreign = yield* Effect.flip(read(stranger, attachment.id))
          const missing = yield* Effect.flip(read(owner, unknown))

          assertEquals(foreign, new AttachmentNotFoundError({ id: attachment.id }))
          assertEquals(missing, new AttachmentNotFoundError({ id: unknown }))
        }),
    )

    it.effect('delete removes the metadata and the bytes of an unbound attachment', () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto

        yield* service.delete(owner, attachment.id)

        const error = yield* Effect.flip(service.get(owner, attachment.id))
        assertEquals(error, new AttachmentNotFoundError({ id: attachment.id }))
        assert.deepStrictEqual(yield* (yield* AttachmentStore).select(attachment.id), Option.none())
      }),
    )

    it.effect("delete of another user's attachment is AttachmentNotFoundError and keeps it", () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto

        const error = yield* Effect.flip(service.delete(stranger, attachment.id))

        assertEquals(error, new AttachmentNotFoundError({ id: attachment.id }))
        assertEquals(yield* service.download(owner, attachment.id), { attachment, bytes: png })
      }),
    )

    it.effect('delete of a bound attachment is AttachmentBoundError and leaves the bytes', () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto
        yield* bind(attachment)

        const error = yield* Effect.flip(service.delete(owner, attachment.id))

        assertEquals(error, new AttachmentBoundError({ id: attachment.id }))
        assert.deepStrictEqual(
          yield* Effect.map(service.download(owner, attachment.id), ({ bytes }) => bytes),
          png,
        )
      }),
    )
  })
})
