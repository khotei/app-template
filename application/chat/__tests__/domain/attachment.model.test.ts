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
  buildAttachmentFrom,
  buildFileId,
  ensureAllReachableFrom,
  ensureAllStored,
  ensureFound,
  ensureUnbound,
  ensureUnused,
  FileName,
  FileSize,
  MediaType,
} from '#chat/domain/attachment.model'
import { ChatId } from '#chat/domain/chat.id'
import { chatId, messageId } from '#testing/chat/chat.test-fixture'

describe('Attachment', () => {
  const encoded = {
    id: '0192d4e0-7b3a-7c00-8000-000000000020',
    userId: '0192d4e0-7b3a-7c00-8000-000000000010',
    messageId: null,
    chatId: null,
    sourceId: null,
    fileName: 'report.pdf',
    mediaType: 'application/pdf',
    size: 1024,
    createdAt: DateTime.toDateUtc(DateTime.makeUnsafe('2026-10-18T00:00:00.000Z')),
  }
  const decode = Schema.decodeUnknownExit(Attachment)

  it.each([
    { mediaType: 'application/pdf' },
    { mediaType: 'image/svg+xml' },
    { mediaType: 'application/vnd.ms-excel' },
  ])('decodes the media type $mediaType', ({ mediaType }) => {
    assert.isTrue(Exit.isSuccess(decode({ ...encoded, mediaType })))
  })

  it('rejects an empty file name', () => {
    assert.isTrue(Exit.isFailure(decode({ ...encoded, fileName: '' })))
  })

  it.each([
    { mediaType: 'pdf' },
    { mediaType: 'application/' },
    { mediaType: '/pdf' },
    { mediaType: 'image/png extra' },
  ])('rejects the media type $mediaType', ({ mediaType }) => {
    assert.isTrue(Exit.isFailure(decode({ ...encoded, mediaType })))
  })
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

/** The record a send of `unbound`, a library attachment, adds to the chat of `message`. */
const record = new Attachment({
  ...bound,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000026'),
  sourceId: Option.some(unbound.id),
})

describe('buildAttachmentFrom', () => {
  it("builds the chat's record of a library attachment, bound to the message", () => {
    assertEquals(buildAttachmentFrom(unbound, { id: record.id, message }), record)
  })
})

describe('buildFileId', () => {
  it.each([
    { name: 'its own id for an attachment with no source', attachment: unbound },
    { name: "its source's id for a record", attachment: record },
  ])('is $name', ({ attachment }) => {
    assert.strictEqual(buildFileId(attachment), unbound.id)
  })
})

describe('ensureAllReachableFrom', () => {
  const found = [unbound, record]

  it.effect('answers the attachments of the library and of the chat', () =>
    Effect.gen(function* () {
      assertEquals(yield* pipe(found, ensureAllReachableFrom(chatId)), found)
    }),
  )

  it.effect('fails AttachmentNotFoundError naming an attachment of another chat', () =>
    Effect.gen(function* () {
      const otherChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000021')

      const error = yield* pipe(found, ensureAllReachableFrom(otherChatId), Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [record.id] }),
      )
    }),
  )
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

      assertSchemaEquals(
        AttachmentBoundError,
        error,
        new AttachmentBoundError({ id: bound.id, chatIds: [chatId] }),
      )
    }),
  )
})

describe('ensureUnused', () => {
  it.effect('answers an attachment no record names', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* pipe(unbound, ensureUnused([])), unbound)
    }),
  )

  it.effect('fails AttachmentBoundError naming the chat of each record once', () =>
    Effect.gen(function* () {
      const otherChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000021')
      const again = new Attachment({
        ...record,
        id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000027'),
      })
      const elsewhere = new Attachment({
        ...record,
        id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000028'),
        chatId: Option.some(otherChatId),
      })

      const error = yield* pipe(unbound, ensureUnused([record, again, elsewhere]), Effect.flip)

      assertSchemaEquals(
        AttachmentBoundError,
        error,
        new AttachmentBoundError({ id: unbound.id, chatIds: [chatId, otherChatId] }),
      )
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

      assertSchemaEquals(
        AttachmentBoundError,
        error,
        new AttachmentBoundError({ id: bound.id, chatIds: [chatId] }),
      )
    }),
  )
})

describe('ensureFound', () => {
  it.effect('answers the value found', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* pipe(Option.some(unbound), ensureFound(unbound.id)), unbound)
    }),
  )

  it.effect('fails AttachmentNotFoundError naming the id for an absent value', () =>
    Effect.gen(function* () {
      const error = yield* pipe(Option.none(), ensureFound(unbound.id), Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [unbound.id] }),
      )
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

  it.effect("keeps a record when the store holds its source's bytes", () =>
    Effect.gen(function* () {
      assertEquals(yield* pipe([record], ensureAllStored([record.id], [unbound.id])), [record])
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
