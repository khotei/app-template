import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, snakeCase, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, id } from '@app-template/packages/db'

import { messages } from '#kernel/data/chat/message.table'
import { users } from '#kernel/data/user/user.table'

const mediaTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/

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
