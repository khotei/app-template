import { inArray } from 'drizzle-orm'
import { Array as Arr, Context, Effect, identity, Layer, type Option, UndefinedOr } from 'effect'

import { buildSet, buildWhere, orDieUnless, orDieWithSqlError } from '@app-template/packages/db'

import { Db } from '#kernel/data/db.client'
import type {
  JobEntity,
  JobEntityInsert,
  JobEntitySet,
  JobEntityUpdateWhere,
  JobEntityWhere,
} from '#kernel/data/job/job.entity'
import { jobs } from '#kernel/data/job/job.table'

const encodeSet = buildSet<JobEntitySet, typeof jobs>({ status: identity })

const encodeWhere = buildWhere<JobEntityWhere>({
  id: UndefinedOr.map((id) => inArray(jobs.id, id)),
  status: UndefinedOr.map((status) => inArray(jobs.status, status)),
})

export class JobRepository extends Context.Service<
  JobRepository,
  {
    readonly insert: (job: typeof JobEntityInsert.Type) => Effect.Effect<void>
    readonly selectOne: (
      where: JobEntityWhere,
    ) => Effect.Effect<Option.Option<typeof JobEntity.Type>>
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
        selectOne: Effect.fn('JobRepository.selectOne')(
          (where) =>
            db.select().from(jobs).where(encodeWhere(where)).limit(1).pipe(Effect.map(Arr.head)),
          orDieWithSqlError,
        ),
        update: Effect.fn('JobRepository.update')(
          (set, where) =>
            db
              .update(jobs)
              .set(encodeSet(set))
              .where(encodeWhere(where))
              .returning({ id: jobs.id })
              .pipe(orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no job was updated')),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
