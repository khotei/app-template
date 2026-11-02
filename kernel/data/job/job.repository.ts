import { inArray, isNull } from 'drizzle-orm'
import { Context, Effect, Layer, UndefinedOr } from 'effect'

import { buildSet, buildWhere, orDieOnNoRows, orDieWithSqlError } from '@app-template/packages/db'

import { Db } from '#kernel/data/db.client'
import type {
  JobEntity,
  JobEntityInsert,
  JobEntitySet,
  JobEntityUpdateWhere,
  JobEntityWhere,
} from '#kernel/data/job/job.entity'
import { jobs } from '#kernel/data/job/job.table'

const encodeSet = buildSet<JobEntitySet, typeof jobs>({ sentAt: (sentAt) => sentAt })

const encodeWhere = buildWhere<JobEntityWhere>({
  id: UndefinedOr.map((id) => inArray(jobs.id, id)),
  sentAt: UndefinedOr.map(() => isNull(jobs.sentAt)),
})

export class JobRepository extends Context.Service<
  JobRepository,
  {
    readonly insert: (job: typeof JobEntityInsert.Type) => Effect.Effect<void>
    /**
     * The oldest jobs first, at most `limit`, each locked until the transaction ends; a job
     * another transaction holds is skipped, so concurrent relays share the jobs out.
     */
    readonly selectMany: (
      where: JobEntityWhere,
      options: { readonly limit: number },
    ) => Effect.Effect<ReadonlyArray<typeof JobEntity.Type>>
    readonly update: (set: JobEntitySet, where: JobEntityUpdateWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/job/JobRepository') {
  static readonly layer = Layer.effect(
    this,
    Db.useSync((db) =>
      this.of({
        insert: Effect.fn('JobRepository.insert')(
          (job) => db.insert(jobs).values(job),
          orDieWithSqlError,
        ),
        selectMany: Effect.fn('JobRepository.selectMany')(
          (where, { limit }) =>
            db
              .select()
              .from(jobs)
              .where(encodeWhere(where))
              .orderBy(jobs.createdAt, jobs.id)
              .limit(limit)
              .for('update', { skipLocked: true }),
          orDieWithSqlError,
        ),
        update: Effect.fn('JobRepository.update')(
          (set, where) =>
            db
              .update(jobs)
              .set(encodeSet(set))
              .where(encodeWhere(where))
              .returning({ id: jobs.id })
              .pipe(orDieOnNoRows('no job was updated')),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
