import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import {
  Attachment,
  AttachmentId,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { buildChat, buildUserMessage, ChatId, Message, MessageId } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import {
  AttachmentInsert,
  attachments,
  decodeAttachment,
} from '#infrastructure/attachment/attachment.entity'
import { decodeMessage } from '#infrastructure/chat/message.entity'
import { Db } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db'
import { insertChat, insertMessage, insertUser } from '#infrastructure/db/testing/rows'

const chatCreatedAt = DateTime.makeUnsafe('2026-10-18T00:00:00.000Z')
const uploadedAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')
const laterUploadedAt = DateTime.makeUnsafe('2026-10-18T00:00:01.456Z')
const sentAt = DateTime.makeUnsafe('2026-10-18T00:00:02.789Z')

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000090')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000091')
const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000092')

const question = (attachmentIds: ReadonlyArray<AttachmentId>) =>
  buildUserMessage({
    id: messageId,
    chatId,
    text: 'What is in these files?',
    attachmentIds,
    createdAt: sentAt,
  })

const attachment = (
  id: AttachmentId,
  { messageId, createdAt }: { messageId: Option.Option<MessageId>; createdAt: DateTime.Utc },
) =>
  new Attachment({
    id,
    userId,
    messageId,
    fileName: FileName.make('notes.txt'),
    mediaType: MediaType.make('text/plain'),
    size: FileSize.make(42),
    createdAt,
  })

const loneAttachment = (messageId: Option.Option<MessageId>) =>
  attachment(AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000093'), {
    messageId,
    createdAt: uploadedAt,
  })

const insertQuestion = Effect.gen(function* () {
  yield* insertUser(userId)
  yield* insertChat(buildChat({ id: chatId, userId, createdAt: chatCreatedAt }))
  yield* insertMessage(question([]))
})

const insertAttachment = (attachment: Attachment) =>
  Effect.flatMap(Db, (db) =>
    db.insert(attachments).values(Schema.encodeSync(AttachmentInsert)(attachment)),
  )

const selectAttachments = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db.select().from(attachments)
  return yield* Effect.forEach(rows, decodeAttachment)
})

const MessageWithAttachments = Schema.Struct({
  message: Message,
  attachments: Schema.Array(Attachment),
})

describe('attachments', () => {
  it.effect.each([
    { name: 'unbound', messageId: Option.none() },
    { name: 'bound to a message', messageId: Option.some(messageId) },
  ])('reads an attachment $name back as the model it was written from', ({ messageId }) =>
    Effect.gen(function* () {
      yield* insertQuestion
      yield* insertAttachment(loneAttachment(messageId))
      const selected = yield* selectAttachments

      assertSchemaEquals(Schema.Array(Attachment), selected, [loneAttachment(messageId)])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect.each([
    { name: 'an empty file name', check: 'attachments_file_name_check', fields: { fileName: '' } },
    {
      name: 'a media type without a subtype',
      check: 'attachments_media_type_check',
      fields: { mediaType: 'text' },
    },
    { name: 'a negative size', check: 'attachments_size_check', fields: { size: -1 } },
  ])('refuses $name through its check', ({ check, fields }) =>
    Effect.gen(function* () {
      const db = yield* Db
      const row = Schema.encodeSync(AttachmentInsert)(loneAttachment(Option.none()))

      yield* insertQuestion
      const error = yield* flipSqlError(db.insert(attachments).values({ ...row, ...fields }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), check)
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('nests a message’s attachments by created_at then id, not by insert order', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const bound = { messageId: Option.some(messageId) }
      const earliest = attachment(AttachmentId.make('0192d4e0-7b3a-7c00-8000-0000000000a2'), {
        ...bound,
        createdAt: uploadedAt,
      })
      const laterLowerId = attachment(AttachmentId.make('0192d4e0-7b3a-7c00-8000-0000000000a1'), {
        ...bound,
        createdAt: laterUploadedAt,
      })
      const laterHigherId = attachment(AttachmentId.make('0192d4e0-7b3a-7c00-8000-0000000000a3'), {
        ...bound,
        createdAt: laterUploadedAt,
      })

      yield* insertQuestion
      yield* Effect.forEach([laterHigherId, earliest, laterLowerId], insertAttachment, {
        discard: true,
      })
      const rows = yield* db.query.messages.findMany({
        with: { attachments: { orderBy: { createdAt: 'asc', id: 'asc' } } },
      })
      const found = yield* Effect.forEach(rows, (row) =>
        Effect.all({
          message: decodeMessage(row),
          attachments: Effect.forEach(row.attachments, decodeAttachment),
        }),
      )

      assertSchemaEquals(Schema.Array(MessageWithAttachments), found, [
        {
          message: question([earliest.id, laterLowerId.id, laterHigherId.id]),
          attachments: [earliest, laterLowerId, laterHigherId],
        },
      ])
    }).pipe(Effect.provide(DbTest)),
  )
})
