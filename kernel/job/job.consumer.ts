import { Array as Arr, type Cause, Context, Effect, Exit, Layer, Schema } from 'effect'

import type { JobEntity } from '@app-template/kernel/data'
import { JobRepository } from '@app-template/kernel/data'
import {
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

/** What a queue's consumer runs: `handle` on each job, `onFail` on a job about to settle `failed`. */
export interface JobHandlers<A, E, R> {
  readonly handle: (job: A) => Effect.Effect<unknown, E, R>
  readonly onFail?: (jobId: string, cause: Cause.Cause<unknown>) => Effect.Effect<unknown, never, R>
}

export class JobConsumer extends Context.Service<
  JobConsumer,
  {
    /**
     * `QueueConsumer.consume` that runs each job once: the job is marked `running`, then `done`
     * once `handle` succeeds, or `failed` on any other outcome, an interrupt included; no failure
     * is retried, and a settled job is acknowledged. A job found `running` was left by a process
     * that died mid-work, so `handle` runs again and decides what its work left means.
     *
     * A body that does not decode never will, so its job fails at once, unrun and acknowledged:
     * its body stays in the row.
     *
     * `onFail` runs before every `failed`, uninterruptibly, and the job settles only once it
     * succeeds: when it dies, the job stays unsettled and SQS delivers it again.
     */
    readonly consume: <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handlers: JobHandlers<A, E, R>,
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
      { handle, onFail = () => Effect.void }: JobHandlers<A, E, R>,
    ): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
      const decode = Schema.decodeEffect(
        Schema.fromJsonString(Schema.toCodecJson(definition.schema)),
      )

      function fail(job: Job, cause: Cause.Cause<unknown>) {
        return onFail(job.id, cause).pipe(Effect.andThen(settle(job, 'failed')))
      }

      return consumer.consume(
        Effect.fnUntraced(function* (body: string, jobId: string) {
          // A message whose row is missing is a defect: SQS delivers it again, as its commit may
          // not have shown the row yet, then dead-letters it, as after a rollback past the send.
          const job = yield* jobs
            .selectOne({ id: [jobId] })
            .pipe(Effect.flatMap(Effect.fromOption), Effect.orDie)
          if (isSettled(job)) return
          const decoded = yield* decode(body).pipe(
            Effect.tapError((error) => Effect.logError('job does not decode', error)),
            Effect.exit,
          )
          if (Exit.isFailure(decoded))
            return yield* Effect.uninterruptible(fail(job, decoded.cause))

          yield* jobs.update({ status: 'running' }, { id: [job.id], status: unsettledStatuses })
          // The settle runs uninterruptibly, so a stopping worker waits for it.
          yield* Effect.uninterruptibleMask((restore) =>
            restore(handle(decoded.value)).pipe(
              Effect.tapCause((cause) => Effect.logError('job failed', cause)),
              Effect.exit,
              Effect.flatMap(
                Exit.match({
                  onSuccess: () => settle(job, 'done'),
                  onFailure: (cause) => fail(job, cause),
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
  static readonly layer: Layer.Layer<JobConsumer, never, JobRepository> = Layer.effect(
    this,
    this.make,
  ).pipe(Layer.provide(QueueConsumer.layer))
}
