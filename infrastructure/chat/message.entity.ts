import { eq, inArray, type SQL, sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
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

import {
  ActiveMessageStage,
  ChatId,
  MessageAuthor,
  MessageFailure,
  MessageId,
  MessageStage,
} from '@app-template/domain/chat'

import { chats } from '#infrastructure/chat/chat.entity'
import { createdAt, id, updatedAt } from '#infrastructure/db/columns'

export const messageAuthor = pgEnum('message_author', MessageAuthor.literals)

export const messageStage = pgEnum('message_stage', MessageStage.literals)

export const messages = snakeCase.table(
  'messages',
  {
    id: id(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    author: messageAuthor().notNull(),
    stage: messageStage().notNull(),
    text: text().notNull(),
    error: jsonb().$type<typeof MessageFailure.Encoded>(),
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
 * Holds for exactly the rows `isActiveMessage` holds for: the predicate of
 * `messages_chat_id_active_index`.
 *
 * An `ON CONFLICT … WHERE` that targets the index takes its predicate from this constant. Do not
 * remove `.inlineParams()`; why: `docs/knowledge/database.md` › "Schema and entity files".
 */
export const activeMessage: SQL =
  sql`${eq(messages.author, 'assistant')} and ${inArray(messages.stage, ActiveMessageStage.literals)}`.inlineParams()

const messageFields = {
  id: MessageId,
  chatId: ChatId,
  error: Schema.OptionFromNullOr(MessageFailure),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
}

export const MessageRow = createSelectSchema(messages, messageFields)

export const MessageInsert = createInsertSchema(messages, messageFields)

export const inCreationOrder = { createdAt: 'asc', id: 'asc' } as const

export const withAttachments = { attachments: { orderBy: inCreationOrder } } as const
