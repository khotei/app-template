import { inArray, sql } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/effect-schema'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { DbColumn } from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'

/** Why a Run failed, as the column `failure` holds it. */
export const RunFailure = Schema.Struct({
  /** The full text of what ended the Run, for operators; the api keeps it off the wire. */
  cause: Schema.String,
})
export type RunFailure = typeof RunFailure.Type

/** What a Run's reply cost, as the column `usage` holds it. */
export const RunUsage = Schema.Struct({
  /** The model that answered. */
  model: Schema.String,
  /** The prompt's tokens: the uncached, the cache-read and the cache-write ones together. */
  promptTokens: Schema.Int,
  outputTokens: Schema.Int,
  cacheReadTokens: Schema.Int,
  cacheWriteTokens: Schema.Int,
})
export type RunUsage = typeof RunUsage.Type

export const runStatuses = ['queued', 'generating', 'done', 'failed'] as const

export const runStatus = pgEnum('run_status', runStatuses)

export const runs = snakeCase.table(
  'runs',
  {
    id: DbColumn.id(),
    chatId: uuid().notNull(),
    /** The owner of the Run's chat, held by `runs_chat_id_user_id_fk`. */
    userId: uuid().notNull(),
    userMessageId: uuid().notNull(),
    status: runStatus().notNull(),
    failure: jsonb().$type<RunFailure>(),
    /** The assistant's message the Run wrote, once it is done. */
    assistantMessageId: uuid().references(() => messages.id, { onDelete: 'cascade' }),
    usage: jsonb().$type<RunUsage>(),
    createdAt: DbColumn.createdAt(),
    updatedAt: DbColumn.updatedAt(),
  },
  (table) => [
    check('runs_failure_check', sql`(${table.status} = 'failed') = (${table.failure} is not null)`),
    check(
      'runs_assistant_message_id_check',
      sql`(${table.status} = 'done') = (${table.assistantMessageId} is not null)`,
    ),
    check('runs_usage_check', sql`(${table.status} = 'done') = (${table.usage} is not null)`),
    // A reply belongs to one Run.
    unique('runs_assistant_message_id_unique').on(table.assistantMessageId),
    // One key over both columns, so `user_id` can only name the owner of `chat_id`.
    foreignKey({
      name: 'runs_chat_id_user_id_fk',
      columns: [table.chatId, table.userId],
      foreignColumns: [chats.id, chats.userId],
    }).onDelete('cascade'),
    // One key over both columns, so `chat_id` can only name the chat of `user_message_id`.
    foreignKey({
      name: 'runs_user_message_id_chat_id_fk',
      columns: [table.userMessageId, table.chatId],
      foreignColumns: [messages.id, messages.chatId],
    }).onDelete('cascade'),
    uniqueIndex('runs_chat_id_active_index')
      .on(table.chatId)
      .where(inArray(table.status, activeRunStatuses)),
    index('runs_user_message_id_created_at_index').on(table.userMessageId, table.createdAt),
  ],
)

/** The statuses of a Run still in flight, read by the index's predicate. */
export const activeRunStatuses = ['queued', 'generating'] as const

/** The shapes of the `jsonb` columns, which `createSelectSchema` cannot read from the table. */
const runJsonColumns = {
  failure: () => RunFailure,
  usage: () => RunUsage,
}

/** The columns of a Run: what its reads return and the entities of its neighbours nest. */
export const RunColumns = createSelectSchema(runs, runJsonColumns)
export type RunColumns = typeof RunColumns.Type
