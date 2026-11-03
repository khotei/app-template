import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { SqlClient } from 'effect/sql'

import { Db, JobRepository, jobs } from '@app-template/kernel/data'
import { DbTest } from '@app-template/kernel/data/testing/e2e'
import { QueueSender } from '@app-template/packages/queue'

import { QueueSenderJobs } from '#kernel/queue/queue.client'
import { SampleJob, sampleJobQueue, sampleProvenance } from '#testing/queue/e2e/job.test-fixture'

const QueueSenderJobsTest = QueueSenderJobs.pipe(
  Layer.provide(JobRepository.layer),
  Layer.provideMerge(DbTest),
)

const job = new SampleJob({
  chatId: '0192d4e0-7b3a-7c00-8000-000000000030',
  messageId: '0192d4e0-7b3a-7c00-8000-000000000040',
  provenance: sampleProvenance,
})

const selectJobs = Db.use((db) =>
  db.select({ queue: jobs.queue, jobId: jobs.jobId, body: jobs.body }).from(jobs),
)

describe('QueueSenderJobs', () => {
  it.effect(
    'a committed send leaves one unsent row with the queue, the job id and the JSON job',
    () =>
      Effect.gen(function* () {
        const queue = yield* QueueSender
        const sql = yield* SqlClient.SqlClient

        yield* sql.withTransaction(queue.send(sampleJobQueue, job))

        assert.deepStrictEqual(yield* selectJobs, [
          {
            queue: 'assistant-message',
            jobId: '0192d4e0-7b3a-7c00-8000-000000000040',
            body: {
              chatId: '0192d4e0-7b3a-7c00-8000-000000000030',
              messageId: '0192d4e0-7b3a-7c00-8000-000000000040',
              provenance: {
                provider: 'anthropic',
                model: 'claude-sonnet-5-5',
                instructionsHash: 'a1b2c3',
              },
            },
          },
        ])
      }).pipe(Effect.provide(QueueSenderJobsTest)),
  )

  it.effect('a send inside a transaction that then fails leaves no row', () =>
    Effect.gen(function* () {
      const queue = yield* QueueSender
      const sql = yield* SqlClient.SqlClient

      yield* queue
        .send(sampleJobQueue, job)
        .pipe(Effect.andThen(Effect.fail('a later write failed')), sql.withTransaction, Effect.flip)

      assert.deepStrictEqual(yield* selectJobs, [])
    }).pipe(Effect.provide(QueueSenderJobsTest)),
  )
})
