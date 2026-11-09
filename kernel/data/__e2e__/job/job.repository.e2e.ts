import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Deferred, Effect, Exit, Fiber, Layer, Struct } from 'effect'
import { SqlClient } from 'effect/sql'

import type { JobEntityInsert } from '#kernel/data/job/job.entity'
import { JobRepository } from '#kernel/data/job/job.repository'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const JobRepositoryTest = JobRepository.layer.pipe(Layer.provideMerge(DbTest))

const jobId = (n: number) => `0192d4e0-7b3a-7c00-8000-${String(n).padStart(12, '0')}`

const job = (n: number): typeof JobEntityInsert.Type => ({
  id: jobId(n),
  queue: 'sample',
  body: { n },
  status: 'queued',
  createdAt: new Date(`2026-10-18T00:00:0${n}.000Z`),
})

const insertJobs = (ns: ReadonlyArray<number>) =>
  JobRepository.use((repository) =>
    Effect.forEach(ns, (n) => repository.insert(job(n)), { discard: true }),
  )

const selectQueuedIds = (limit: number) =>
  JobRepository.use((repository) => repository.selectMany({ status: ['queued'] }, { limit })).pipe(
    Effect.map(Arr.map(Struct.get('id'))),
  )

describe('JobRepository', () => {
  // The ids ascend while the creation times descend, so an order by id alone answers 1, 2.
  it.effect('selects the queued jobs oldest first, at most the limit', () =>
    Effect.gen(function* () {
      const jobs = yield* JobRepository
      yield* Effect.forEach(
        [1, 2, 3],
        (n) => jobs.insert({ ...job(n), createdAt: job(4 - n).createdAt }),
        { discard: true },
      )

      assert.deepStrictEqual(yield* selectQueuedIds(2), [jobId(3), jobId(2)])
    }).pipe(Effect.provide(JobRepositoryTest)),
  )

  it.effect('a select skips the jobs another transaction holds', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const held = yield* Deferred.make<ReadonlyArray<string>>()
      const release = yield* Deferred.make<void>()
      yield* insertJobs([1, 2, 3])

      const holder = yield* selectQueuedIds(1).pipe(
        Effect.tap((ids) => Deferred.succeed(held, ids)),
        Effect.tap(() => Deferred.await(release)),
        sql.withTransaction,
        Effect.forkChild,
      )
      const heldIds = yield* Deferred.await(held)
      const others = yield* sql.withTransaction(selectQueuedIds(10))
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(holder)

      assert.deepStrictEqual(heldIds, [jobId(1)])
      assert.deepStrictEqual(others, [jobId(2), jobId(3)])
    }).pipe(Effect.provide(JobRepositoryTest)),
  )

  it.effect('an update sets the status of the jobs it names, which leave the queued', () =>
    Effect.gen(function* () {
      const jobs = yield* JobRepository
      yield* insertJobs([1, 2, 3])

      yield* jobs.update({ status: 'running' }, { id: [jobId(1), jobId(3)], status: ['queued'] })

      assert.deepStrictEqual(yield* selectQueuedIds(10), [jobId(2)])
    }).pipe(Effect.provide(JobRepositoryTest)),
  )

  it.effect('an update that matches no job dies', () =>
    Effect.gen(function* () {
      const jobs = yield* JobRepository

      const exit = yield* jobs
        .update({ status: 'running' }, { id: [jobId(1)], status: ['queued'] })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(JobRepositoryTest)),
  )

  it.effect('an update of a job that left the statuses it names dies and keeps its status', () =>
    Effect.gen(function* () {
      const jobs = yield* JobRepository
      yield* insertJobs([1])
      yield* jobs.update({ status: 'done' }, { id: [jobId(1)], status: ['queued'] })

      const exit = yield* jobs
        .update({ status: 'running' }, { id: [jobId(1)], status: ['queued'] })
        .pipe(Effect.exit)
      const stored = yield* jobs.selectMany({ id: [jobId(1)] }, { limit: 1 })

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(Arr.map(stored, Struct.get('status')), ['done'])
    }).pipe(Effect.provide(JobRepositoryTest)),
  )
})
