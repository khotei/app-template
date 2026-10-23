import { assert, describe, it } from '@effect/vitest'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
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
  AttachmentRow,
  attachments,
} from '#infrastructure/attachment/attachment.entity'
import { ChatInsert, chats } from '#infrastructure/chat/chat.entity'
import { MessageInsert, MessageRow, messages } from '#infrastructure/chat/message.entity'
import { Db, unwrapQueryError } from '#infrastructure/db/db.client'
import { DbTest } from '#infrastructure/db/testing/db'
import { users } from '#infrastructure/user/user.entity'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000090')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000091')
const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000092')

const question = buildUserMessage({
  id: messageId,
  chatId,
  text: 'What is in this file?',
  attachmentIds: [AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000093')],
  createdAt,
})

const attachment = (messageId: Option.Option<MessageId>) =>
  new Attachment({
    id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000093'),
    userId,
    messageId,
    fileName: FileName.make('notes.txt'),
    mediaType: MediaType.make('text/plain'),
    size: FileSize.make(42),
    createdAt,
  })

const insertMessage = Effect.gen(function* () {
  const db = yield* Db

  yield* db.insert(users).values({ id: userId, createdAt: new Date(0) })
  yield* db
    .insert(chats)
    .values(Schema.encodeSync(ChatInsert)(buildChat({ id: chatId, userId, createdAt })))
  yield* db.insert(messages).values(Schema.encodeSync(MessageInsert)(question))
})

const insertAttachment = (attachment: Attachment) =>
  Effect.flatMap(Db, (db) =>
    db.insert(attachments).values(Schema.encodeSync(AttachmentInsert)(attachment)),
  )

const decodeAttachment = (row: typeof AttachmentRow.Encoded) =>
  Effect.map(Schema.decodeEffect(AttachmentRow)(row), (fields) => new Attachment(fields))

const decodeMessage = (row: typeof MessageRow.Encoded) =>
  Effect.map(Schema.decodeEffect(MessageRow)(row), (fields) => new Message(fields))

const selectAttachments = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db.select().from(attachments)
  return yield* Effect.forEach(rows, decodeAttachment)
})

const flipSqlError = <A, R>(self: Effect.Effect<A, EffectDrizzleQueryError, R>) =>
  Effect.flip(self.pipe(Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError)))

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
      yield* insertMessage
      yield* insertAttachment(attachment(messageId))
      const selected = yield* selectAttachments

      assertSchemaEquals(Schema.Array(Attachment), selected, [attachment(messageId)])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect.each([
    { name: 'an empty file name', check: 'attachments_file_name_check', fields: { fileName: '' } },
    { name: 'a negative size', check: 'attachments_size_check', fields: { size: -1 } },
  ])('refuses $name through its check', ({ check, fields }) =>
    Effect.gen(function* () {
      const db = yield* Db
      const row = Schema.encodeSync(AttachmentInsert)(attachment(Option.none()))

      yield* insertMessage
      const error = yield* flipSqlError(db.insert(attachments).values({ ...row, ...fields }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), check)
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('nests a message’s bound attachments under it in a relational query', () =>
    Effect.gen(function* () {
      const db = yield* Db

      yield* insertMessage
      yield* insertAttachment(attachment(Option.some(messageId)))
      const rows = yield* db.query.messages.findMany({ with: { attachments: true } })
      const found = yield* Effect.forEach(rows, ({ attachments, ...row }) =>
        Effect.all({
          message: decodeMessage(row),
          attachments: Effect.forEach(attachments, decodeAttachment),
        }),
      )

      assertSchemaEquals(Schema.Array(MessageWithAttachments), found, [
        { message: question, attachments: [attachment(Option.some(messageId))] },
      ])
    }).pipe(Effect.provide(DbTest)),
  )
})
