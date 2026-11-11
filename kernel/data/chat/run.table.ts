import { inArray, type SQL, sql } from 'drizzle-orm'
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

import { createdAt, id, updatedAt } from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'

export const runFailureReasons = ['ReplyFailed', 'ReplyRefused'] as const

/** Why a Run failed, as the column `failure` holds it. */
export const RunFailureJson = Schema.Struct({
  reason: Schema.Literals(runFailureReasons),
  message: Schema.String,
  cause: Schema.String,
})

/** Who the api expected to answer the Run, as the column `provenance` holds it. */
export const RunProvenanceJson = Schema.Struct({
  provider: Schema.String,
  model: Schema.String,
  instructionsHash: Schema.String,
})

export const runStatuses = ['queued', 'preparing', 'generating', 'done', 'failed'] as const

export const runStatus = pgEnum('run_status', runStatuses)

export const runs = snakeCase.table(
  'runs',
  {
    id: id(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userMessageId: uuid().notNull(),
    status: runStatus().notNull(),
    failure: jsonb().$type<typeof RunFailureJson.Type>(),
    provenance: jsonb().$type<typeof RunProvenanceJson.Type>().notNull(),
    /** The assistant's message the Run wrote, once it is done. */
    assistantMessageId: uuid().references(() => messages.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('runs_failure_check', sql`(${table.status} = 'failed') = (${table.failure} is not null)`),
    check(
      'runs_assistant_message_id_check',
      sql`(${table.status} = 'done') = (${table.assistantMessageId} is not null)`,
    ),
    // A reply belongs to one Run.
    unique('runs_assistant_message_id_unique').on(table.assistantMessageId),
    // One key over both columns, so `chat_id` can only name the chat of `user_message_id`.
    foreignKey({
      name: 'runs_user_message_id_chat_id_fk',
      columns: [table.userMessageId, table.chatId],
      foreignColumns: [messages.id, messages.chatId],
    }).onDelete('cascade'),
    uniqueIndex('runs_chat_id_active_index').on(table.chatId).where(activeRun),
    index('runs_user_message_id_created_at_index').on(table.userMessageId, table.createdAt),
  ],
)

/** The statuses of a Run still in flight, read by the index's predicate and the memory fake. */
export const activeRunStatuses = ['queued', 'preparing', 'generating'] as const

/**
 * Holds for a Run still in flight: the predicate of `runs_chat_id_active_index`.
 *
 * An `ON CONFLICT … WHERE` that targets the index takes its predicate from this constant. Do not
 * remove `.inlineParams()`; why: `docs/knowledge/database.md` › "Schema and entity files".
 */
export const activeRun: SQL = sql`${inArray(runs.status, activeRunStatuses)}`.inlineParams()

/** The shapes of the `jsonb` columns, which `createSelectSchema` cannot read from the table. */
export const runJsonColumns = {
  failure: () => RunFailureJson,
  provenance: () => RunProvenanceJson,
}

/** The columns of a Run, as the entities of its neighbours nest them. */
export const RunColumns = createSelectSchema(runs, runJsonColumns)
export type RunColumns = typeof RunColumns.Type
