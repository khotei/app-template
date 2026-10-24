import { eq, inArray, type SQL, sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { index, jsonb, pgEnum, snakeCase, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { AttachmentId } from '@app-template/domain/attachment'
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
    attachmentIds: uuid().array().notNull(),
    error: jsonb().$type<typeof MessageFailure.Encoded>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('messages_chat_id_created_at_index').on(table.chatId, table.createdAt),
    uniqueIndex('messages_chat_id_active_index').on(table.chatId).where(activeMessage),
  ],
)

/**
 * Holds for a row `isActiveMessage` holds for: the predicate of `messages_chat_id_active_index`.
 *
 * Do not remove `.inlineParams()`: with bound parameters `ON CONFLICT … WHERE` stops matching
 * the index. Why: `docs/knowledge/database.md` › "Schema and entity files".
 */
export const activeMessage: SQL =
  sql`${eq(messages.author, 'assistant')} and ${inArray(messages.stage, ActiveMessageStage.literals)}`.inlineParams()

const AttachmentIds = Schema.Array(AttachmentId).pipe(
  Schema.encodeTo(Schema.mutable(Schema.Array(Schema.String))),
)

const messageFields = {
  id: MessageId,
  chatId: ChatId,
  attachmentIds: AttachmentIds,
  error: Schema.OptionFromNullOr(MessageFailure),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
}

export const MessageRow = createSelectSchema(messages, messageFields)

export const MessageInsert = createInsertSchema(messages, messageFields)
