import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Exit, Option, pipe, Schema } from 'effect'

import { UserId } from '@app-template/application/identity'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  Attachment,
  bindAttachment,
  buildAttachment,
  ensureAllLive,
  ensureAllStored,
  ensureUnbound,
  FileName,
  FileSize,
  isLiveAt,
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

const message = { id: messageId, chatId }

const bound = new Attachment({
  ...unbound,
  messageId: Option.some(messageId),
  chatId: Option.some(chatId),
})

describe('isLiveAt', () => {
  it.effect.each([
    { now: '2026-10-18T23:59:59.999Z', live: true },
    { now: '2026-10-19T00:00:00.000Z', live: false },
  ])('an unbound attachment made at 2026-10-18T00:00Z at $now: $live', ({ now, live }) =>
    Effect.sync(() => assert.strictEqual(isLiveAt(DateTime.makeUnsafe(now))(unbound), live)),
  )

  it('keeps a bound attachment live, however old', () => {
    assert.isTrue(isLiveAt(DateTime.makeUnsafe('2027-10-18T00:00:00.000Z'))(bound))
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

describe('ensureAllLive', () => {
  const other = new Attachment({
    ...unbound,
    id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000025'),
    createdAt: DateTime.makeUnsafe('2026-10-18T12:00:00.000Z'),
  })
  const missing = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')
  const beforeExpiry = unbound.createdAt
  // `unbound` has expired, `other` has not.
  const afterUnboundExpiry = DateTime.makeUnsafe('2026-10-19T00:00:00.000Z')

  it.effect('answers the attachments found when they hold every id asked', () =>
    Effect.gen(function* () {
      const found = [unbound, other]

      assertEquals(yield* pipe(found, ensureAllLive([other.id, unbound.id], beforeExpiry)), found)
    }),
  )

  it.effect('names each missing id, in the order asked', () =>
    Effect.gen(function* () {
      const error = yield* pipe(
        [unbound],
        ensureAllLive([missing, unbound.id, other.id], beforeExpiry),
        Effect.flip,
      )

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [missing, other.id] }),
      )
    }),
  )

  it.effect('names an expired id asked twice once', () =>
    Effect.gen(function* () {
      const error = yield* pipe(
        [unbound],
        ensureAllLive([unbound.id, unbound.id], afterUnboundExpiry),
        Effect.flip,
      )

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [unbound.id] }),
      )
    }),
  )

  it.effect('names an expired attachment as missing and answers a live one', () =>
    Effect.gen(function* () {
      const read = [unbound, other]

      const error = yield* pipe(
        read,
        ensureAllLive([unbound.id, other.id], afterUnboundExpiry),
        Effect.flip,
      )
      const live = yield* pipe(read, ensureAllLive([other.id], afterUnboundExpiry))

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [unbound.id] }),
      )
      assertEquals(live, [other])
    }),
  )
})

describe('ensureAllStored', () => {
  const other = new Attachment({
    ...unbound,
    id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000025'),
  })
  const found = [unbound, other]

  it.effect('answers the attachments when the store holds every one asked', () =>
    Effect.gen(function* () {
      const stored = [other.id, unbound.id]

      assertEquals(yield* pipe(found, ensureAllStored([unbound.id, other.id], stored)), found)
    }),
  )

  it.effect('names each lost id once, in the order asked', () =>
    Effect.gen(function* () {
      const error = yield* pipe(
        found,
        ensureAllStored([other.id, unbound.id, other.id], []),
        Effect.flip,
      )

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [other.id, unbound.id] }),
      )
    }),
  )

  it.effect('names the lost one and not the stored one', () =>
    Effect.gen(function* () {
      const error = yield* pipe(
        found,
        ensureAllStored([unbound.id, other.id], [unbound.id]),
        Effect.flip,
      )

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [other.id] }),
      )
    }),
  )
})
