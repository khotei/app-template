import { sql } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, index, jsonb, snakeCase, text, unique, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { createdAt, id, updatedAt } from '@app-template/packages/db'

import { users } from '#kernel/data/user/user.table'

const tokens = {
  promptTokens: Schema.Int,
  outputTokens: Schema.Int,
  cacheReadTokens: Schema.Int,
  cacheWriteTokens: Schema.Int,
}

/** What a chat's replies cost together and where its context stands, as the column `usage` holds it. */
export const ChatUsage = Schema.Struct({
  /** The counts of every reply of the chat, added up. */
  total: Schema.Struct(tokens),
  context: Schema.Struct({
    /** The tokens of the last prompt and its reply. */
    tokensSize: Schema.Int,
    /** The first message a reply sends, null for the chat's first. */
    startMessageId: Schema.NullOr(Schema.String),
  }),
})
export type ChatUsage = typeof ChatUsage.Type

export const chats = snakeCase.table(
  'chats',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text(),
    /** Null until the chat's first reply. */
    usage: jsonb().$type<ChatUsage>(),
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
export const ChatColumns = createSelectSchema(chats, { usage: () => ChatUsage })
export type ChatColumns = typeof ChatColumns.Type
