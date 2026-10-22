import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { AttachmentBoundError, AttachmentNotFoundError } from '#domain/attachment/attachment.error'
import { AttachmentId } from '#domain/attachment/attachment.id'
import { Attachment, FileName, FileSize, MediaType } from '#domain/attachment/attachment.model'
import { buildAttachment, ensureBindable } from '#domain/attachment/attachment.service'
import { MessageId } from '#domain/chat/chat.id'
import { UserId } from '#domain/user/user.id'

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.000Z')

const unbound = (id: string, owner: UserId = userId) =>
  buildAttachment({
    id: AttachmentId.make(id),
    userId: owner,
    fileName: FileName.make('photo.png'),
    mediaType: MediaType.make('image/png'),
    size: FileSize.make(1024),
    createdAt,
  })

describe('buildAttachment', () => {
  it('starts unbound, with no message', () => {
    const attachment = unbound('0192d4e0-7b3a-7c00-8000-000000000020')

    assert.isTrue(Option.isNone(attachment.messageId))
    assert.strictEqual(attachment.userId, userId)
    assert.strictEqual(attachment.size, 1024)
  })
})

describe('ensureBindable', () => {
  const owned = unbound('0192d4e0-7b3a-7c00-8000-000000000021')

  it.effect("returns the user's unbound attachment", () =>
    Effect.gen(function* () {
      const attachment = yield* ensureBindable(Option.some(owned), {
        id: owned.id,
        userId,
        now: createdAt,
      })

      assert.strictEqual(attachment, owned)
    }),
  )

  it.effect('fails AttachmentNotFoundError when nothing was found', () =>
    Effect.gen(function* () {
      const id = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

      const error = yield* Effect.flip(
        ensureBindable(Option.none(), { id, userId, now: createdAt }),
      )

      assertSchemaEquals(AttachmentNotFoundError, error, new AttachmentNotFoundError({ id }))
    }),
  )

  it.effect("fails AttachmentNotFoundError for another user's attachment", () =>
    Effect.gen(function* () {
      const foreign = unbound(
        '0192d4e0-7b3a-7c00-8000-000000000022',
        UserId.make('0192d4e0-7b3a-7c00-8000-000000000011'),
      )

      const error = yield* Effect.flip(
        ensureBindable(Option.some(foreign), { id: foreign.id, userId, now: createdAt }),
      )

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ id: foreign.id }),
      )
    }),
  )

  it.effect('fails AttachmentBoundError for an attachment already bound to a message', () =>
    Effect.gen(function* () {
      const bound = new Attachment({
        ...unbound('0192d4e0-7b3a-7c00-8000-000000000023'),
        messageId: Option.some(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')),
      })

      const error = yield* Effect.flip(
        ensureBindable(Option.some(bound), { id: bound.id, userId, now: createdAt }),
      )

      assertSchemaEquals(AttachmentBoundError, error, new AttachmentBoundError({ id: bound.id }))
    }),
  )
})
