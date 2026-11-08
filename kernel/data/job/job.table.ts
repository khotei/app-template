import { sql } from 'drizzle-orm'
import { index, jsonb, pgEnum, snakeCase, text } from 'drizzle-orm/pg-core'
import type { Schema } from 'effect'

import { createdAt, id } from '@app-template/packages/db'

/**
 * `idle` until SQS takes the job, `queued` until the worker takes it, `running` while an attempt
 * runs and `queued` again before a retry, then `done` or `failed`; a job stays `idle` when its
 * send fails.
 */
export const jobStatuses = ['idle', 'queued', 'running', 'done', 'failed'] as const

export const jobStatus = pgEnum('job_status', jobStatuses)

/**
 * Jobs a transaction wrote, sent to SQS once it commits: `queue` is a definition's name, before
 * the stage; `body` is the job encoded through its definition's schema. A settled job keeps its
 * row, so operators read what each job carried. No index on `body`: nothing queries it.
 */
export const jobs = snakeCase.table(
  'jobs',
  {
    id: id(),
    queue: text().notNull(),
    body: jsonb().$type<Schema.Json>().notNull(),
    status: jobStatus().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('jobs_idle_created_at_index').on(table.createdAt).where(sql`${table.status} = 'idle'`),
  ],
)
