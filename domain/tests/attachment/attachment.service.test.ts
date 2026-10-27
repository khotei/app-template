import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { AttachmentBoundError, AttachmentNotFoundError } from '#domain/attachment/attachment.error'
import { AttachmentId } from '#domain/attachment/attachment.id'
import { Attachment, FileName, FileSize, MediaType } from '#domain/attachment/attachment.model'
import { buildAttachment, ensureBindable, isVisibleTo } from '#domain/attachment/attachment.service'
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

describe('isVisibleTo', () => {
  const owned = unbound('0192d4e0-7b3a-7c00-8000-000000000024')

  it.each([
    { now: '2026-10-18T23:59:59.999Z', visible: true },
    { now: '2026-10-19T00:00:00.000Z', visible: false },
  ])(
    'shows an unbound attachment made at 2026-10-18T00:00Z at $now: $visible',
    ({ now, visible }) => {
      assert.strictEqual(isVisibleTo(userId, DateTime.makeUnsafe(now))(owned), visible)
    },
  )

  it('shows a bound attachment however old it is', () => {
    const bound = new Attachment({
      ...owned,
      messageId: Option.some(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000031')),
    })

    assert.isTrue(isVisibleTo(userId, DateTime.makeUnsafe('2027-10-18T00:00:00.000Z'))(bound))
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
