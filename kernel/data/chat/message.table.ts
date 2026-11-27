import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { foreignKey, index, pgEnum, snakeCase, text, unique, uuid } from 'drizzle-orm/pg-core'

import { DbColumn } from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'

export const messageAuthors = ['user', 'assistant'] as const

export const messageAuthor = pgEnum('message_author', messageAuthors)

export const messages = snakeCase.table(
  'messages',
  {
    id: DbColumn.id(),
    chatId: uuid().notNull(),
    /** The owner of the message's chat, held by `messages_chat_id_user_id_fk`. */
    userId: uuid().notNull(),
    author: messageAuthor().notNull(),
    text: text().notNull(),
    createdAt: DbColumn.createdAt(),
  },
  (table) => [
    // One key over both columns, so `user_id` can only name the owner of `chat_id`.
    foreignKey({
      name: 'messages_chat_id_user_id_fk',
      columns: [table.chatId, table.userId],
      foreignColumns: [chats.id, chats.userId],
    }).onDelete('cascade'),
    index('messages_chat_id_created_at_index').on(table.chatId, table.createdAt),
    // The target of `runs_user_message_id_chat_id_fk`.
    unique('messages_id_chat_id_unique').on(table.id, table.chatId),
  ],
)

/** The columns of a message, as the entities of its neighbours nest them. */
export const MessageColumns = createSelectSchema(messages)
export type MessageColumns = typeof MessageColumns.Type
