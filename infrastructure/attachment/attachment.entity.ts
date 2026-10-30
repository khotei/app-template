import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, foreignKey, index, integer, snakeCase, text, uuid } from 'drizzle-orm/pg-core'
import { Schema, SchemaGetter } from 'effect'

import {
  Attachment,
  AttachmentId,
  FileName,
  FileSize,
  MediaType,
  mediaTypePattern,
} from '@app-template/domain/attachment'
import { ChatId, Message, MessageId } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'

import { MessageRow, messages } from '#infrastructure/chat/message.entity'
import { createdAt, id } from '#infrastructure/db/columns'
import { users } from '#infrastructure/user/user.entity'

export const attachments = snakeCase.table(
  'attachments',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    messageId: uuid(),
    chatId: uuid(),
    fileName: text().notNull(),
    mediaType: text().notNull(),
    size: integer().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check('attachments_file_name_check', sql`${table.fileName} <> ''`),
    check('attachments_media_type_check', sql`${table.mediaType} ~* ${mediaTypePattern.source}`),
    check('attachments_size_check', sql`${table.size} >= 0`),
    check(
      'attachments_message_id_chat_id_check',
      sql`(${table.messageId} is null) = (${table.chatId} is null)`,
    ),
    // One key over both columns, so `chat_id` can only name the chat of `message_id`.
    foreignKey({
      name: 'attachments_message_id_chat_id_fk',
      columns: [table.messageId, table.chatId],
      foreignColumns: [messages.id, messages.chatId],
    }).onDelete('cascade'),
    index('attachments_chat_id_index').on(table.chatId),
    index('attachments_message_id_created_at_id_index').on(
      table.messageId,
      table.createdAt,
      table.id,
    ),
  ],
)

const attachmentFields = {
  id: AttachmentId,
  userId: UserId,
  messageId: Schema.OptionFromNullOr(MessageId),
  chatId: Schema.OptionFromNullOr(ChatId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtcFromDate,
}

export const AttachmentRow = createSelectSchema(attachments, attachmentFields)

export const AttachmentInsert = createInsertSchema(attachments, attachmentFields)

export const AttachmentFromRow = AttachmentRow.pipe(Schema.decodeTo(Attachment))

/** A message row with its attachments nested, as `withAttachments` reads it; decode only. */
export const MessageDetailFromRow = Schema.Struct({
  ...MessageRow.fields,
  attachments: Schema.Array(AttachmentRow),
}).pipe(
  Schema.decodeTo(Schema.Struct({ message: Message, attachments: Schema.Array(Attachment) }), {
    decode: SchemaGetter.transform(({ attachments, ...message }) => ({ message, attachments })),
    encode: SchemaGetter.forbiddenEncoding,
  }),
)
