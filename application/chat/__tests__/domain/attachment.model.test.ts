import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Exit, Option, pipe, Schema } from 'effect'

import { UserId } from '@app-template/application/identity'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import {
  Attachment,
  bindAttachment,
  buildBytesId,
  copyAttachment,
  ensureAllAttachmentsFound,
  ensureUnbound,
  ensureUnused,
  FileName,
  FileSize,
  MediaType,
} from '#chat/domain/attachment.model'
import { AttachmentId } from '#chat/domain/attachment.util'
import { ChatId } from '#chat/domain/chat.util'
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

const unbound = new Attachment({
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

/** The copy a send of `unbound`, a library attachment, adds to the chat of `message`. */
const copy = new Attachment({
  ...bound,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000026'),
  sourceId: Option.some(unbound.id),
})

describe('copyAttachment', () => {
  it("builds the chat's copy of a library attachment, sent with the message", () => {
    assertEquals(copyAttachment(unbound, { id: copy.id, chatId, messageId }), copy)
  })
})

describe('buildBytesId', () => {
  it.each([
    { name: 'its own id for an attachment with no source', attachment: unbound },
    { name: "its source's id for a copy", attachment: copy },
  ])('is $name', ({ attachment }) => {
    assert.strictEqual(buildBytesId(attachment), unbound.id)
  })
})

describe('ensureAllAttachmentsFound', () => {
  it.effect(
    'fails AttachmentNotFoundError naming an id the read left out, in the order asked',
    () =>
      Effect.gen(function* () {
        const absent = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

        const error = yield* pipe(
          [unbound],
          ensureAllAttachmentsFound([absent, unbound.id]),
          Effect.flip,
        )

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ ids: [absent] }),
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
  it.effect('answers an attachment no copy names', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* pipe(unbound, ensureUnused([])), unbound)
    }),
  )

  it.effect('fails AttachmentBoundError naming the chat of each copy once', () =>
    Effect.gen(function* () {
      const otherChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000021')
      const again = new Attachment({
        ...copy,
        id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000027'),
      })
      const elsewhere = new Attachment({
        ...copy,
        id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000028'),
        chatId: Option.some(otherChatId),
      })

      const error = yield* pipe(unbound, ensureUnused([copy, again, elsewhere]), Effect.flip)

      assertSchemaEquals(
        AttachmentBoundError,
        error,
        new AttachmentBoundError({ id: unbound.id, chatIds: [chatId, otherChatId] }),
      )
    }),
  )
})

describe('bindAttachment', () => {
  it('binds an unbound attachment to the message and its chat', () => {
    assertEquals(bindAttachment(unbound, message), bound)
  })
})
