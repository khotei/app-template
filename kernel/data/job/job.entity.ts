import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { jobs } from '#kernel/data/job/job.table'

export const JobEntity = createSelectSchema(jobs)

export const JobEntityInsert = createInsertSchema(jobs)

type JobStatus = (typeof JobEntity.Type)['status']

interface JobFilter {
  readonly id: ReadonlyArray<string>
  /** Matches a job in any of these statuses. */
  readonly status: ReadonlyArray<JobStatus>
}

export type JobEntityWhere = Types.Simplify<RequireAtLeastOne<JobFilter>>

/** Names the jobs and the statuses they leave, so a write never matches every job nor moves one back. */
export type JobEntityUpdateWhere = JobFilter

export type JobEntitySet = Pick<typeof JobEntity.Type, 'status'>
