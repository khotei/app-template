import { index, jsonb, snakeCase, text } from 'drizzle-orm/pg-core'
import type { Schema } from 'effect'

import { createdAt, id } from '#infrastructure/db/columns'

/**
 * Jobs a transaction wrote for the relay to send: `queue` is a definition's name, before the
 * stage; `body` is the job encoded through its definition's schema. No index on `body`: nothing
 * queries it.
 */
export const outbox = snakeCase.table(
  'outbox',
  {
    id: id(),
    queue: text().notNull(),
    jobId: text().notNull(),
    body: jsonb().$type<Schema.Json>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('outbox_created_at_index').on(table.createdAt)],
)
