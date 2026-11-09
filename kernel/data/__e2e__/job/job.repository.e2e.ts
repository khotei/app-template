import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Exit, Layer, Option, Struct } from 'effect'

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

const selectStatuses = (ns: ReadonlyArray<number>) =>
  JobRepository.use((repository) =>
    Effect.forEach(ns, (n) =>
      repository.selectOne({ id: [jobId(n)] }).pipe(Effect.map(Option.map(Struct.get('status')))),
    ),
  ).pipe(Effect.map(Arr.getSomes))

describe('JobRepository', () => {
  it.effect('an update sets the status of the jobs it names, which leave the queued', () =>
    Effect.gen(function* () {
      const jobs = yield* JobRepository
      yield* insertJobs([1, 2, 3])

      yield* jobs.update({ status: 'running' }, { id: [jobId(1), jobId(3)], status: ['queued'] })

      assert.deepStrictEqual(yield* selectStatuses([1, 2, 3]), ['running', 'queued', 'running'])
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

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(yield* selectStatuses([1]), ['done'])
    }).pipe(Effect.provide(JobRepositoryTest)),
  )
})
