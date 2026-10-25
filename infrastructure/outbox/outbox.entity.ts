import { index, snakeCase, text } from 'drizzle-orm/pg-core'

import { createdAt, id } from '#infrastructure/db/columns'

/** Jobs a transaction wrote for the relay to send: `queue` is a definition's name, before the stage. */
export const outbox = snakeCase.table(
  'outbox',
  {
    id: id(),
    queue: text().notNull(),
    jobId: text().notNull(),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('outbox_created_at_index').on(table.createdAt)],
)
