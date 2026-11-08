import type { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Context, Effect, Exit, Layer, Option, type Schema } from 'effect'

import type { JobEntity } from '@app-template/kernel/data'
import { JobRepository } from '@app-template/kernel/data'
import {
  type AttemptInfo,
  type Handler,
  QueueConsumer,
  type QueueDefinition,
  type SqsBatchResponse,
  type SqsEvent,
} from '@app-template/packages/queue-2'

/** The statuses a job leaves for `done` or `failed`, never to come back. */
const unsettledStatuses = ['idle', 'queued'] as const

type Job = typeof JobEntity.Type

function isSettled(job: Job): boolean {
  return !Arr.contains(unsettledStatuses, job.status)
}

/** `done` once the handler succeeds, `failed` once the last attempt fails, else no change. */
function buildSettledStatus(
  exit: Exit.Exit<unknown, unknown>,
  info: AttemptInfo,
): Option.Option<'done' | 'failed'> {
  if (Exit.isSuccess(exit)) return Option.some('done')
  return info.isLastAttempt ? Option.some('failed') : Option.none()
}

export class JobConsumer extends Context.Service<
  JobConsumer,
  {
    /**
     * `QueueConsumer.consume` that settles each job's row from its handler's outcome; a job
     * already settled is a redelivery, acknowledged without running the handler.
     */
    readonly consume: <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ) => (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R>
  }
>()('@app-template/kernel/job/JobConsumer', {
  make: Effect.gen(function* () {
    const consumer = yield* QueueConsumer
    const jobs = yield* JobRepository

    function settle(job: Job, info: AttemptInfo) {
      return (exit: Exit.Exit<unknown, unknown>) =>
        buildSettledStatus(exit, info).pipe(
          Option.match({
            onNone: () => Effect.void,
            onSome: (status) =>
              jobs.update({ status }, { id: [job.id], status: unsettledStatuses }),
          }),
        )
    }

    function consume<A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
      return consumer.consume(
        definition,
        Effect.fnUntraced(function* (message: A, info: AttemptInfo) {
          // A message whose row is missing is a defect: SQS retries it, then dead-letters it.
          const job = yield* jobs
            .selectOne({ id: [info.jobId] })
            .pipe(Effect.flatMap(Effect.fromOption), Effect.orDie)
          if (isSettled(job)) return

          yield* handle(message, info).pipe(Effect.onExit(settle(job, info)))
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
