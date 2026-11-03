import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { jobs } from '#kernel/data/job/job.table'

export const JobEntity = createSelectSchema(jobs)

export const JobEntityInsert = createInsertSchema(jobs)

interface JobFilter {
  readonly id: ReadonlyArray<string>
  /** Matches the jobs the relay has not sent yet. */
  readonly sentAt: null
}

export type JobEntityWhere = Types.Simplify<RequireAtLeastOne<JobFilter>>

/** Names the jobs and finds them unsent, so a write never matches every job nor sets `sentAt` twice. */
export type JobEntityUpdateWhere = JobFilter

export type JobEntitySet = Types.Simplify<RequireAtLeastOne<Pick<typeof JobEntity.Type, 'sentAt'>>>
