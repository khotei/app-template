import type { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Context, Effect, Exit, Layer, Result, Schema } from 'effect'

import type { JobEntity } from '@app-template/kernel/data'
import { JobRepository } from '@app-template/kernel/data'
import {
  type AttemptInfo,
  type Handler,
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

/** `done` once the handler succeeds, `failed` once the last attempt fails, else `queued` for the retry. */
function buildAttemptStatus(
  exit: Exit.Exit<unknown, unknown>,
  info: AttemptInfo,
): 'done' | 'failed' | 'queued' {
  if (Exit.isSuccess(exit)) return 'done'
  return info.isLastAttempt ? 'failed' : 'queued'
}

export class JobConsumer extends Context.Service<
  JobConsumer,
  {
    /**
     * `QueueConsumer.consume` that decodes each job's body, marks its row `running` before its
     * handler, then settles it from the outcome; a job already settled is a redelivery,
     * acknowledged without running the handler.
     *
     * A body that does not decode never will, so its job fails at once, unrun and acknowledged:
     * its body stays in the row.
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
        jobs.update(
          { status: buildAttemptStatus(exit, info) },
          { id: [job.id], status: unsettledStatuses },
        )
    }

    function consume<A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
      const decode = Schema.decodeEffect(
        Schema.fromJsonString(Schema.toCodecJson(definition.schema)),
      )

      return consumer.consume(
        definition,
        Effect.fnUntraced(function* (body: string, info: AttemptInfo) {
          // A message whose row is missing is a defect: SQS retries it, then dead-letters it.
          const job = yield* jobs
            .selectOne({ id: [info.jobId] })
            .pipe(Effect.flatMap(Effect.fromOption), Effect.orDie)
          if (isSettled(job)) return
          const decoded = yield* decode(body).pipe(Effect.result)
          if (Result.isFailure(decoded)) {
            yield* Effect.logError('job does not decode', decoded.failure)
            return yield* jobs.update(
              { status: 'failed' },
              { id: [job.id], status: unsettledStatuses },
            )
          }

          yield* jobs.update({ status: 'running' }, { id: [job.id], status: unsettledStatuses })
          yield* handle(decoded.success, info).pipe(Effect.onExit(settle(job, info)))
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
