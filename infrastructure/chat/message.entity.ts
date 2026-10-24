import { eq, inArray, type SQL, sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { index, jsonb, pgEnum, snakeCase, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { Array as Arr, Effect, Schema } from 'effect'

import { AttachmentId } from '@app-template/domain/attachment'
import {
  ActiveMessageStage,
  ChatId,
  Message,
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

const MessageWithAttachmentsRow = Schema.Struct({
  ...MessageRow.fields,
  attachments: Schema.Array(Schema.Struct({ id: AttachmentId })),
})

export const decodeMessage = (row: typeof MessageWithAttachmentsRow.Encoded) =>
  Effect.map(
    Schema.decodeEffect(MessageWithAttachmentsRow)(row),
    ({ attachments, ...fields }) =>
      new Message({
        ...fields,
        attachmentIds: Arr.map(attachments, (attachment) => attachment.id),
      }),
  )
