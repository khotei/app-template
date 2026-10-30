import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, index, snakeCase, text, uuid } from 'drizzle-orm/pg-core'
import { Schema, Struct } from 'effect'

import { Chat, ChatId, ChatStatus, ChatTitle, maxTitleLength } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'

import { createdAt, id, updatedAt } from '#infrastructure/db/columns'
import { users } from '#infrastructure/user/user.entity'

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
    index('chats_user_id_updated_at_index').on(table.userId, table.updatedAt.desc().nullsFirst()),
  ],
)

const chatFields = {
  id: ChatId,
  userId: UserId,
  title: Schema.OptionFromNullOr(ChatTitle),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
}

export const ChatRow = createSelectSchema(chats, chatFields)

export const ChatInsert = createInsertSchema(chats, chatFields)

/** A row with the status a second read derives from the chat's messages: no column stores it. */
export const ChatFromRow = ChatRow.mapFields(Struct.assign({ status: ChatStatus })).pipe(
  Schema.decodeTo(Chat),
)
