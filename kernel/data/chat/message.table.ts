import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { index, pgEnum, snakeCase, text, unique, uuid } from 'drizzle-orm/pg-core'

import { createdAt, id } from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'

export const messageAuthors = ['user', 'assistant'] as const

export const messageAuthor = pgEnum('message_author', messageAuthors)

export const messages = snakeCase.table(
  'messages',
  {
    id: id(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    author: messageAuthor().notNull(),
    text: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('messages_chat_id_created_at_index').on(table.chatId, table.createdAt),
    // The target of `attachments_message_id_chat_id_fk` and `runs_user_message_id_chat_id_fk`.
    unique('messages_id_chat_id_unique').on(table.id, table.chatId),
  ],
)

/** The columns of a message, as the entities of its neighbours nest them. */
export const MessageColumns = createSelectSchema(messages)
export type MessageColumns = typeof MessageColumns.Type
