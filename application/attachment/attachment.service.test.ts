import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, layer } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Layer, Option, Record as Rec } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { TestClock, TestCrypto } from 'effect/testing'

import {
  Attachment,
  AttachmentBoundError,
  type AttachmentId,
  AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import type { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryKv, AttachmentStoreKv } from '@app-template/infrastructure/attachment'
import { isUuidV7 } from '@app-template/testing'

import { AttachmentService } from '#application/attachment/attachment.service'
import { png, unknownAttachmentId } from '#application/testing/attachment.fixture'
import { messageId } from '#application/testing/chat.fixture'
import { owner, stranger } from '#application/testing/user.fixture'

const AttachmentServiceTest = AttachmentService.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(AttachmentRepositoryKv, AttachmentStoreKv)),
  Layer.provide(TestCrypto.layer('attachment-service').pipe(Layer.provide(BunCrypto.layer))),
  Layer.provide(KeyValueStore.layerMemory),
)

const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

const uploadPhoto = Effect.flatMap(AttachmentService, (service) =>
  service.upload(owner, { ...photo, bytes: png }),
)

type Read = (userId: UserId, id: AttachmentId) => Effect.Effect<unknown, AttachmentNotFoundError>

const pickReader = (service: AttachmentService['Service'], method: 'get' | 'download'): Read =>
  ({ get: service.get, download: service.download })[method]

const bind = (attachment: Attachment) =>
  Effect.flatMap(AttachmentRepository, (attachments) =>
    attachments.update(new Attachment({ ...attachment, messageId: Option.some(messageId) })),
  )

const selectStored = (ids: ReadonlyArray<AttachmentId>) =>
  Effect.flatMap(AttachmentRepository, (attachments) => attachments.selectByIds(ids))

const selectBytes = (id: AttachmentId) =>
  Effect.flatMap(AttachmentStore, (store) => store.select(id))

const unbindable = {
  'an unknown id': {
    arrange: Effect.succeed(unknownAttachmentId),
    refusal: (id: AttachmentId) => new AttachmentNotFoundError({ id }),
  },
  "another user's attachment": {
    arrange: Effect.flatMap(AttachmentService, (service) =>
      Effect.map(service.upload(stranger, { ...photo, bytes: png }), (foreign) => foreign.id),
    ),
    refusal: (id: AttachmentId) => new AttachmentNotFoundError({ id }),
  },
  'a bound attachment': {
    arrange: Effect.gen(function* () {
      const attachment = yield* uploadPhoto
      yield* bind(attachment)
      return attachment.id
    }),
    refusal: (id: AttachmentId) => new AttachmentBoundError({ id }),
  },
} as const

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

          const foreign = yield* Effect.flip(read(stranger, attachment.id))
          const missing = yield* Effect.flip(read(owner, unknownAttachmentId))

          assertEquals(foreign, new AttachmentNotFoundError({ id: attachment.id }))
          assertEquals(missing, new AttachmentNotFoundError({ id: unknownAttachmentId }))
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

    it.effect("findBindable returns the user's unbound attachments in the order asked", () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const first = yield* uploadPhoto
        const second = yield* uploadPhoto

        const bindable = yield* service.findBindable(owner, [second.id, first.id])

        assertEquals(bindable.attachments, [second, first])
      }),
    )

    it.effect.each(Rec.keys(unbindable))('findBindable with %s is refused', (name) =>
      Effect.gen(function* () {
        const { arrange, refusal } = unbindable[name]
        const service = yield* AttachmentService
        const valid = yield* uploadPhoto
        const refused = yield* arrange

        const error = yield* Effect.flip(service.findBindable(owner, [valid.id, refused]))

        assertEquals(error, refusal(refused))
      }),
    )

    it.effect('bind stores the attachments bound to the message and returns them', () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachments = [yield* uploadPhoto, yield* uploadPhoto]
        const bindable = yield* service.findBindable(
          owner,
          Arr.map(attachments, (attachment) => attachment.id),
        )

        const bound = yield* service.bind(bindable, messageId)

        assertEquals(
          bound,
          Arr.map(
            attachments,
            (attachment) => new Attachment({ ...attachment, messageId: Option.some(messageId) }),
          ),
        )
        assertEquals(
          yield* selectStored(Arr.map(attachments, (attachment) => attachment.id)),
          bound,
        )
      }),
    )

    it.effect(
      'deleteByIds removes bound and unbound attachments with their bytes, and only them',
      () =>
        Effect.gen(function* () {
          const service = yield* AttachmentService
          const unbound = yield* uploadPhoto
          const bound = yield* uploadPhoto
          yield* bind(bound)
          const kept = yield* uploadPhoto

          yield* service.deleteByIds([unbound.id, bound.id, unknownAttachmentId])

          assertEquals(yield* selectStored([unbound.id, bound.id, kept.id]), [kept])
          assert.deepStrictEqual(yield* selectBytes(unbound.id), Option.none())
          assert.deepStrictEqual(yield* selectBytes(bound.id), Option.none())
          assert.deepStrictEqual(yield* selectBytes(kept.id), Option.some(png))
        }),
    )
  })
})
