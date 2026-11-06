import { BunCrypto } from '@effect/platform-bun'
import { describe, it } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'

import { RepositoryStackTest } from '@app-template/kernel/data/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { AttachmentNotFoundError } from '#chat/domain/attachment.error'
import type { AttachmentId } from '#chat/domain/attachment.id'
import { FileAttachmentService } from '#chat/services/file-attachment.service'
import { LiveAttachmentService } from '#chat/services/live-attachment.service'
import { upload } from '#testing/chat/attachment.test-layer'
import { owner, stranger } from '#testing/chat/chat.test-fixture'

/** The live service over the memory layers; the file service stores what the cases read. */
const LiveAttachmentServiceTest = Layer.mergeAll(
  LiveAttachmentService.layer,
  FileAttachmentService.layer,
).pipe(Layer.provideMerge(RepositoryStackTest), Layer.provide(BunCrypto.layer))

const readers = [
  {
    name: 'getOne',
    read: (service: LiveAttachmentService['Service'], id: AttachmentId) =>
      service.getOne({ id, userId: owner }).pipe(Effect.asVoid),
  },
  {
    name: 'getMany',
    read: (service: LiveAttachmentService['Service'], id: AttachmentId) =>
      service.getMany({ id: [id], userId: owner }).pipe(Effect.asVoid),
  },
] as const

describe('LiveAttachmentService', () => {
  it.effect.each(readers)(
    '$name of an attachment unbound for 24 h is AttachmentNotFoundError',
    ({ read }) =>
      Effect.gen(function* () {
        const service = yield* LiveAttachmentService
        const attachment = yield* upload(owner)
        yield* TestClock.adjust(Duration.hours(24))

        const error = yield* read(service, attachment.id).pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ ids: [attachment.id] }),
        )
      }).pipe(Effect.provide(LiveAttachmentServiceTest)),
  )

  it.effect("getMany of another user's attachment is AttachmentNotFoundError", () =>
    Effect.gen(function* () {
      const service = yield* LiveAttachmentService
      const foreign = yield* upload(stranger)

      const error = yield* service.getMany({ id: [foreign.id], userId: owner }).pipe(Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [foreign.id] }),
      )
    }).pipe(Effect.provide(LiveAttachmentServiceTest)),
  )
})
