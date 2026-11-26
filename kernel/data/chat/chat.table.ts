import { sql } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, index, jsonb, snakeCase, text, unique, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { createdAt, id, updatedAt } from '@app-template/packages/db'

import { users } from '#kernel/data/user/user.table'

/**
 * What a chat keeps of its context once compacted, as the column `context` holds it: the
 * latest summary of the messages a reply no longer sends, and the message its replies send from.
 */
export const ChatContext = Schema.Struct({
  compacted: Schema.String,
  headMessageId: Schema.String,
})
export type ChatContext = typeof ChatContext.Type

export const chats = snakeCase.table(
  'chats',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text(),
    /** Null until the chat's context is cut. */
    context: jsonb().$type<ChatContext>(),
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
export const ChatColumns = createSelectSchema(chats, { context: () => ChatContext })
export type ChatColumns = typeof ChatColumns.Type
