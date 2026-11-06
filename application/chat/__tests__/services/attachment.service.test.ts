import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Duration, Effect, Layer, Option, Struct } from 'effect'
import { TestClock } from 'effect/testing'

import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { RepositoryStackTest } from '@app-template/kernel/data/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import { AttachmentService } from '#chat/services/attachment.service'
import { FileAttachmentService } from '#chat/services/file-attachment.service'
import { selectAttachments, upload } from '#testing/chat/attachment.test-layer'
import { chatId, firstMessage, messageId, owner, stranger } from '#testing/chat/chat.test-fixture'
import { insertMessage } from '#testing/chat/chat.test-layer'

const unknownAttachmentId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

/**
 * The plain service over the memory layers, on fresh rows where the message a send binds to
 * exists; the file service stores what the cases read.
 */
const AttachmentServiceTest = Layer.mergeAll(
  AttachmentService.layer,
  FileAttachmentService.layer,
).pipe(
  Layer.provideMerge(Layer.effectDiscard(insertMessage(firstMessage))),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide(BunCrypto.layer),
)

const uploadPhoto = upload(owner)

const downloadBytes = (id: AttachmentId) =>
  FileRepository.use((files) => files.download({ id })).pipe(
    Effect.map(Option.map(Struct.get('blob'))),
  )

describe('AttachmentService', () => {
  it.effect('getOne answers an attachment unbound for 24 h', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto
      yield* TestClock.adjust(Duration.hours(24))

      assertEquals(yield* service.getOne({ id: attachment.id, userId: owner }), attachment)
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect("getOne of another user's id or of an unknown id is AttachmentNotFoundError", () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto

      const foreign = yield* service
        .getOne({ id: attachment.id, userId: stranger })
        .pipe(Effect.flip)
      const missing = yield* service
        .getOne({ id: unknownAttachmentId, userId: owner })
        .pipe(Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        foreign,
        new AttachmentNotFoundError({ ids: [attachment.id] }),
      )
      assertSchemaEquals(
        AttachmentNotFoundError,
        missing,
        new AttachmentNotFoundError({ ids: [unknownAttachmentId] }),
      )
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect(
    "getMany answers the user's attachments, leaving out another user's and an unknown id",
    () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const own = yield* uploadPhoto
        const foreign = yield* upload(stranger)
        yield* TestClock.adjust(Duration.hours(24))

        const found = yield* service.getMany({
          id: [foreign.id, own.id, unknownAttachmentId],
          userId: owner,
        })

        assertEquals(found, [own])
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('getMany of no ids answers none', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService

      assert.deepStrictEqual(yield* service.getMany({ id: [], userId: owner }), [])
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('delete with no messageId removes the attachments, one bound, then their bytes', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const unbound = yield* uploadPhoto
      const bound = yield* uploadPhoto
      yield* AttachmentRepository.use((attachments) =>
        attachments.update({ messageId, chatId }, { id: [bound.id] }),
      )
      const ids = [unbound.id, bound.id]

      yield* service.delete({ id: ids, userId: owner })

      assert.deepStrictEqual(yield* selectAttachments(ids), [])
      assert.deepStrictEqual(yield* Effect.forEach(ids, downloadBytes), [
        Option.none(),
        Option.none(),
      ])
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )
})
