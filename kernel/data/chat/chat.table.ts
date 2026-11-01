import { sql } from 'drizzle-orm'
import { check, index, pgEnum, snakeCase, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, id, updatedAt } from '@app-template/db'

import { users } from '#kernel/data/user/user.table'

const maxTitleLength = 120

export const chatStatus = pgEnum('chat_status', ['idle', 'queued', 'failed'])

export const chats = snakeCase.table(
  'chats',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text(),
    status: chatStatus().notNull().default('idle'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'chats_title_check',
      sql`${table.title} = btrim(${table.title}) and char_length(${table.title}) between 1 and ${maxTitleLength}`,
    ),
    index('chats_user_id_created_at_index').on(table.userId, table.createdAt.desc().nullsFirst()),
    index('chats_user_id_updated_at_index').on(table.userId, table.updatedAt.desc().nullsFirst()),
  ],
)
