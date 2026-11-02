import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Exit, Option, Schema } from 'effect'

import { UserId } from '@app-template/application/identity'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { AttachmentBoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  Attachment,
  bindAttachment,
  buildAttachment,
  ensureUnbound,
  FileName,
  FileSize,
  isExpiredAt,
  MediaType,
} from '#chat/domain/attachment.model'
import { chatId, messageId } from '#testing/chat/chat.test-fixture'

describe('Attachment', () => {
  const encoded = {
    id: '0192d4e0-7b3a-7c00-8000-000000000020',
    userId: '0192d4e0-7b3a-7c00-8000-000000000010',
    messageId: Option.none(),
    chatId: Option.none(),
    fileName: 'report.pdf',
    mediaType: 'application/pdf',
    size: 1024,
    createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.000Z'),
  }
  const decode = Schema.decodeUnknownExit(Attachment)

  it.effect.each([
    { mediaType: 'application/pdf' },
    { mediaType: 'image/svg+xml' },
    { mediaType: 'application/vnd.ms-excel' },
  ])('decodes the media type $mediaType', ({ mediaType }) =>
    Effect.sync(() => assert.isTrue(Exit.isSuccess(decode({ ...encoded, mediaType })))),
  )

  it('rejects an empty file name', () => {
    assert.isTrue(Exit.isFailure(decode({ ...encoded, fileName: '' })))
  })

  it.effect.each([
    { mediaType: 'pdf' },
    { mediaType: 'application/' },
    { mediaType: '/pdf' },
    { mediaType: 'image/png extra' },
  ])('rejects the media type $mediaType', ({ mediaType }) =>
    Effect.sync(() => assert.isTrue(Exit.isFailure(decode({ ...encoded, mediaType })))),
  )
})

const unbound = buildAttachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
  userId: UserId.make('0192d4e0-7b3a-7c00-8000-000000000010'),
  fileName: FileName.make('photo.png'),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(1024),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.000Z'),
})

const message = { messageId, chatId }

const bound = new Attachment({
  ...unbound,
  messageId: Option.some(messageId),
  chatId: Option.some(chatId),
})

describe('isExpiredAt', () => {
  it.effect.each([
    { now: '2026-10-18T23:59:59.999Z', expired: false },
    { now: '2026-10-19T00:00:00.000Z', expired: true },
  ])('an unbound attachment made at 2026-10-18T00:00Z at $now: $expired', ({ now, expired }) =>
    Effect.sync(() => assert.strictEqual(isExpiredAt(DateTime.makeUnsafe(now))(unbound), expired)),
  )

  it('never expires a bound attachment, however old', () => {
    assert.isFalse(isExpiredAt(DateTime.makeUnsafe('2027-10-18T00:00:00.000Z'))(bound))
  })
})

describe('ensureUnbound', () => {
  it.effect('returns an unbound attachment', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* Effect.succeed(unbound).pipe(ensureUnbound), unbound)
    }),
  )

  it.effect('fails AttachmentBoundError for an attachment a message holds', () =>
    Effect.gen(function* () {
      const error = yield* Effect.succeed(bound).pipe(ensureUnbound, Effect.flip)

      assertSchemaEquals(AttachmentBoundError, error, new AttachmentBoundError({ id: bound.id }))
    }),
  )
})

describe('bindAttachment', () => {
  it.effect('binds an unbound attachment to the message and its chat', () =>
    Effect.gen(function* () {
      assertEquals(yield* bindAttachment(unbound, message), bound)
    }),
  )

  it.effect('fails AttachmentBoundError for an attachment a message holds', () =>
    Effect.gen(function* () {
      const error = yield* bindAttachment(bound, message).pipe(Effect.flip)

      assertSchemaEquals(AttachmentBoundError, error, new AttachmentBoundError({ id: bound.id }))
    }),
  )
})
