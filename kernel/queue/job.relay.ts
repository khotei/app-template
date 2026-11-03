import { Array as Arr, Cause, DateTime, Effect, Layer, Predicate, Schedule, Struct } from 'effect'
import { SqlClient } from 'effect/sql'

import { buildResourceName } from '@app-template/kernel/aws'
import { AwsConfig, QueueConfig } from '@app-template/kernel/config'
import { type JobEntity, JobRepository } from '@app-template/kernel/data'
import { QueueTransport } from '@app-template/packages/queue'

const batchLimit = 10

type Job = typeof JobEntity.Type

const isFullBatch = (batch: ReadonlyArray<Job>) => batch.length === batchLimit

/**
 * Sends the jobs to SQS: each batch of unsent jobs is locked, sent and marked sent in one
 * transaction, so a failed send leaves its jobs for the next poll.
 *
 * Delivery is at-least-once: a crash between a send and the commit sends the job again.
 */
export const JobRelay = Effect.gen(function* () {
  const jobs = yield* JobRepository
  const sql = yield* SqlClient.SqlClient
  const transport = yield* QueueTransport
  const { stage } = yield* AwsConfig
  const { outboxPollInterval } = yield* QueueConfig

  const sendJob = (job: Job) =>
    transport.send(buildResourceName(stage, job.queue), {
      body: JSON.stringify(job.body),
      attributes: { jobId: job.jobId },
    })

  const markSent = Effect.fnUntraced(function* (batch: Arr.NonEmptyReadonlyArray<Job>) {
    const sentAt = yield* DateTime.nowAsDate
    yield* jobs.update({ sentAt }, { id: Arr.map(batch, Struct.get('id')), sentAt: null })
  })

  const relayBatch = jobs
    .selectMany({ sentAt: null }, { limit: batchLimit })
    .pipe(
      Effect.tap(Effect.forEach(sendJob, { discard: true })),
      Effect.tap(Arr.match({ onEmpty: () => Effect.void, onNonEmpty: markSent })),
      sql.withTransaction,
    )

  yield* relayBatch.pipe(
    Effect.repeat({ while: isFullBatch }),
    Effect.tapCauseIf(Predicate.not(Cause.hasInterruptsOnly), (cause) =>
      Effect.logError('outbox relay failed', cause),
    ),
    Effect.catchCauseIf(Predicate.not(Cause.hasInterruptsOnly), () => Effect.void),
    Effect.repeat(Schedule.spaced(outboxPollInterval)),
    Effect.forkScoped,
  )
}).pipe(Layer.effectDiscard, Layer.provide(QueueConfig.layer))

export const JobRelaySqs = JobRelay.pipe(
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide(AwsConfig.layer),
)
