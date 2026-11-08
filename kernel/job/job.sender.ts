import type { SQSService } from '@effect-aws/client-sqs'
import { Context, Crypto, DateTime, Effect, identity, Layer, Schema } from 'effect'

import { buildResourceName } from '@app-template/kernel/aws'
import { AwsConfig } from '@app-template/kernel/config'
import { type JobEntity, JobRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'
import { type QueueDefinition, QueueSender } from '@app-template/packages/queue'

type Job = typeof JobEntity.Type

export class JobSender extends Context.Service<
  JobSender,
  {
    /**
     * Writes the job as an `idle` row, joining the caller's transaction, and answers the step
     * that sends it to SQS under the row's id and marks it `queued`: run that step once the row
     * is committed. A send SQS refuses is logged and leaves the job `idle` for the sweep.
     */
    readonly send: <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) => Effect.Effect<Effect.Effect<void>>
  }
>()('@app-template/kernel/job/JobSender', {
  make: Effect.gen(function* () {
    const jobs = yield* JobRepository
    const sender = yield* QueueSender
    const crypto = yield* Crypto.Crypto
    const { stage } = yield* AwsConfig

    const enqueue = Effect.fn('JobSender.enqueue')(
      (job: Job) =>
        sender
          .send(buildResourceName(stage, job.queue), {
            body: JSON.stringify(job.body),
            jobId: job.id,
          })
          .pipe(
            Effect.andThen(jobs.update({ status: 'queued' }, { id: [job.id], status: ['idle'] })),
            Effect.tapError((error) =>
              Effect.logWarning('job send failed, left for the sweep', error),
            ),
            Effect.ignore,
          ),
      (effect, job) => Effect.annotateLogs(effect, { jobId: job.id }),
    )

    const send = Effect.fn('JobSender.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* Schema.encodeEffect(Schema.toCodecJson(definition.schema))(message).pipe(
        Effect.orDie,
      )
      const id = yield* generateId(crypto, identity)
      const now = yield* DateTime.nowAsDate

      const job: Job = { id, queue: definition.name, body, status: 'idle', createdAt: now }
      yield* jobs.insert(job)
      return enqueue(job)
    })

    return { send }
  }),
}) {
  static readonly layer: Layer.Layer<
    JobSender,
    never,
    JobRepository | Crypto.Crypto | SQSService | AwsConfig
  > = Layer.effect(this, this.make).pipe(Layer.provide(QueueSender.layer))
}
