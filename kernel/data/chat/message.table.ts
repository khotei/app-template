import { eq, inArray, type SQL, sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { createdAt, id, updatedAt } from '@app-template/db'

import { chats } from '#kernel/data/chat/chat.table'

/** Why a reply failed, as the column `error` holds it. */
export const MessageFailureJson = Schema.Struct({
  reason: Schema.Literals(['ReplyFailed', 'ReplyRefused']),
  message: Schema.String,
  cause: Schema.String,
})

export const messageAuthor = pgEnum('message_author', ['user', 'assistant'])

export const messageStatus = pgEnum('message_status', [
  'queued',
  'preparing',
  'generating',
  'done',
  'failed',
])

export const messages = snakeCase.table(
  'messages',
  {
    id: id(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    author: messageAuthor().notNull(),
    status: messageStatus().notNull(),
    text: text().notNull(),
    error: jsonb().$type<typeof MessageFailureJson.Type>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('messages_chat_id_created_at_index').on(table.chatId, table.createdAt),
    uniqueIndex('messages_chat_id_active_index').on(table.chatId).where(activeMessage),
    // The target of `attachments_message_id_chat_id_fk`.
    unique('messages_id_chat_id_unique').on(table.id, table.chatId),
  ],
)

/**
 * Holds for an assistant message whose reply still runs: the predicate of
 * `messages_chat_id_active_index`.
 *
 * An `ON CONFLICT … WHERE` that targets the index takes its predicate from this constant. Do not
 * remove `.inlineParams()`; why: `docs/knowledge/database.md` › "Schema and entity files".
 */
export const activeMessage: SQL =
  sql`${eq(messages.author, 'assistant')} and ${inArray(messages.status, ['queued', 'preparing', 'generating'])}`.inlineParams()
