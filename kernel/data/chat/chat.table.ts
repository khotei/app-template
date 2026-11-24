import { sql } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, index, snakeCase, text, unique, uuid } from 'drizzle-orm/pg-core'

import { createdAt, id, updatedAt } from '@app-template/packages/db'

import { users } from '#kernel/data/user/user.table'

export const maxTitleLength = 120

/** What a `text` column stores: Postgres refuses U+0000 in it. */
export const textPattern = /^[^\0]*$/u

export const chats = snakeCase.table(
  'chats',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'chats_title_check',
      sql`${table.title} = btrim(${table.title}) and char_length(${table.title}) between 1 and ${maxTitleLength}`,
    ),
    index('chats_user_id_created_at_index').on(table.userId, table.createdAt.desc().nullsFirst()),
    // The target of `messages_chat_id_user_id_fk` and `runs_chat_id_user_id_fk`.
    unique('chats_id_user_id_unique').on(table.id, table.userId),
  ],
)

/** The columns of a chat, which its entity extends. */
export const ChatColumns = createSelectSchema(chats)
export type ChatColumns = typeof ChatColumns.Type
