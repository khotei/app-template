import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, snakeCase, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, id } from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'
import { users } from '#kernel/data/user/user.table'

/**
 * A check reads its source as SQL with `~*` for its `i` flag, so it uses only syntax that
 * JavaScript and Postgres regular expressions read alike.
 */
export const mediaTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i

export const minFileSize = 0

export const attachments = snakeCase.table(
  'attachments',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    messageId: uuid(),
    chatId: uuid().references(() => chats.id, { onDelete: 'cascade' }),
    sourceId: uuid(),
    fileName: text().notNull(),
    mediaType: text().notNull(),
    size: integer().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check('attachments_file_name_check', sql`${table.fileName} <> ''`),
    check('attachments_media_type_check', sql`${table.mediaType} ~* ${mediaTypePattern.source}`),
    check('attachments_size_check', sql`${table.size} >= ${minFileSize}`),
    // The pair key below skips a row with a null in it, so the check refuses a message alone.
    check(
      'attachments_message_id_chat_id_check',
      sql`${table.messageId} is null or ${table.chatId} is not null`,
    ),
    // One key over both columns, so `chat_id` can only name the chat of `message_id`.
    foreignKey({
      name: 'attachments_message_id_chat_id_fk',
      columns: [table.messageId, table.chatId],
      foreignColumns: [messages.id, messages.chatId],
    }).onDelete('cascade'),
    check(
      'attachments_source_id_message_id_check',
      sql`${table.sourceId} is null or ${table.messageId} is not null`,
    ),
    // No cascade: a delete of an attachment that a record names as its source is refused.
    foreignKey({
      name: 'attachments_source_id_fk',
      columns: [table.sourceId],
      foreignColumns: [table.id],
    }),
    index('attachments_chat_id_index').on(table.chatId),
    index('attachments_source_id_index').on(table.sourceId),
    index('attachments_message_id_created_at_id_index').on(
      table.messageId,
      table.createdAt,
      table.id,
    ),
  ],
)
