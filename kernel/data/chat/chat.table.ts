import { sql } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, index, jsonb, snakeCase, text, unique, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { createdAt, id, updatedAt } from '@app-template/packages/db'

import { users } from '#kernel/data/user/user.table'

/** Where a cut left a chat's context, as the column `context` holds it: the first message a reply sends. */
export const ChatContextStart = Schema.Struct({ startMessageId: Schema.String })
export type ChatContextStart = typeof ChatContextStart.Type

export const chats = snakeCase.table(
  'chats',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text(),
    /** Null until the chat's context is cut. */
    context: jsonb().$type<ChatContextStart>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'chats_title_check',
      sql`${table.title} = btrim(${table.title}) and ${table.title} <> ''`,
    ),
    index('chats_user_id_created_at_index').on(table.userId, table.createdAt.desc().nullsFirst()),
    // The target of `messages_chat_id_user_id_fk` and `runs_chat_id_user_id_fk`.
    unique('chats_id_user_id_unique').on(table.id, table.userId),
  ],
)

/** The columns of a chat, which its entity extends. */
export const ChatColumns = createSelectSchema(chats, { context: () => ChatContextStart })
export type ChatColumns = typeof ChatColumns.Type
