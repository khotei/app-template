import type { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Cause, Context, Effect, Exit, Layer, Result, Schema } from 'effect'

import type { JobEntity } from '@app-template/kernel/data'
import { JobRepository } from '@app-template/kernel/data'
import {
  type AttemptInfo,
  QueueConsumer,
  type QueueDefinition,
  type SqsBatchResponse,
  type SqsEvent,
} from '@app-template/packages/queue'

/** The statuses a job leaves for `done` or `failed`, never to come back. */
const unsettledStatuses = ['queued', 'running'] as const

type Job = typeof JobEntity.Type

function isSettled(job: Job): boolean {
  return !Arr.contains(unsettledStatuses, job.status)
}

/** A queue's two steps: the job's work, and what settles it when the work fails. */
export interface JobSteps<A, E, R> {
  readonly handle: (job: A) => Effect.Effect<unknown, E, R>
  readonly fail: (job: A, cause: Cause.Cause<unknown>) => Effect.Effect<unknown, E, R>
}

export class JobConsumer extends Context.Service<
  JobConsumer,
  {
    /**
     * `QueueConsumer.consume` that runs each job once: a `queued` job is marked `running`, then
     * `done` once `handle` succeeds, or `failed` after `fail` on any other outcome, an interrupt
     * included; no failure is retried. A job found `running` was left by a process that died
     * mid-work, so it gets `fail` and `failed` without `handle`; a settled job is acknowledged.
     *
     * A body that does not decode never will, so its job fails at once, unrun and acknowledged:
     * its body stays in the row.
     */
    readonly consume: <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      steps: JobSteps<A, E, R>,
    ) => (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R>
  }
>()('@app-template/kernel/job/JobConsumer', {
  make: Effect.gen(function* () {
    const consumer = yield* QueueConsumer
    const jobs = yield* JobRepository

    function settle(job: Job, status: 'done' | 'failed') {
      return jobs.update({ status }, { id: [job.id], status: unsettledStatuses })
    }

    function consume<A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      steps: JobSteps<A, E, R>,
    ): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
      const decode = Schema.decodeEffect(
        Schema.fromJsonString(Schema.toCodecJson(definition.schema)),
      )

      function fail(job: Job, message: A, cause: Cause.Cause<unknown>) {
        return steps.fail(message, cause).pipe(Effect.andThen(settle(job, 'failed')))
      }

      return consumer.consume(
        definition,
        Effect.fnUntraced(function* (body: string, info: AttemptInfo) {
          // A message whose row is missing is a defect: SQS delivers it again, as its commit may
          // not have shown the row yet, then dead-letters it.
          const job = yield* jobs
            .selectOne({ id: [info.jobId] })
            .pipe(Effect.flatMap(Effect.fromOption), Effect.orDie)
          if (isSettled(job)) return
          const decoded = yield* decode(body).pipe(Effect.result)
          if (Result.isFailure(decoded)) {
            yield* Effect.logError('job does not decode', decoded.failure)
            return yield* settle(job, 'failed')
          }
          if (job.status === 'running') {
            return yield* fail(job, decoded.success, Cause.die('the worker stopped mid-job'))
          }

          yield* jobs.update({ status: 'running' }, { id: [job.id], status: ['queued'] })
          // The settle runs uninterruptibly, so a stopping worker waits for it.
          yield* Effect.uninterruptibleMask((restore) =>
            restore(steps.handle(decoded.success)).pipe(
              Effect.exit,
              Effect.flatMap(
                Exit.match({
                  onSuccess: () => settle(job, 'done'),
                  onFailure: (cause) => fail(job, decoded.success, cause),
                }),
              ),
            ),
          )
        }),
      )
    }

    return { consume }
  }),
}) {
  static readonly layer: Layer.Layer<JobConsumer, never, JobRepository | SQSService> = Layer.effect(
    this,
    this.make,
  ).pipe(Layer.provide(QueueConsumer.layer))
}
