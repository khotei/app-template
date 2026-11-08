import type { SQSService } from '@effect-aws/client-sqs'
import { Context, Crypto, DateTime, Effect, identity, Layer, Schema } from 'effect'
import { SqlClient } from 'effect/sql'

import { buildResourceName } from '@app-template/kernel/aws'
import { AwsConfig } from '@app-template/kernel/config'
import { JobRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'
import { type QueueDefinition, QueueSender } from '@app-template/packages/queue-2'

export class JobSender extends Context.Service<
  JobSender,
  {
    /**
     * Writes the job as an `idle` row, joining the caller's transaction; once it commits, sends
     * the job to SQS and marks it `queued`. A failed send leaves the job `idle` for the sweep.
     */
    readonly send: <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) => Effect.Effect<void>
  }
>()('@app-template/kernel/job/JobSender', {
  make: Effect.gen(function* () {
    const jobs = yield* JobRepository
    const sql = yield* SqlClient.SqlClient
    const sender = yield* QueueSender
    const crypto = yield* Crypto.Crypto
    const { stage } = yield* AwsConfig

    const send = Effect.fn('JobSender.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* Schema.encodeEffect(Schema.toCodecJson(definition.schema))(message).pipe(
        Effect.orDie,
      )
      const id = yield* generateId(crypto, identity)
      const now = yield* DateTime.nowAsDate

      yield* jobs.insert({ id, queue: definition.name, body, status: 'idle', createdAt: now })
      yield* sender
        .send(buildResourceName(stage, definition.name), { body: JSON.stringify(body), jobId: id })
        .pipe(
          Effect.andThen(jobs.update({ status: 'queued' }, { id: [id], status: ['idle'] })),
          Effect.tapError((error) =>
            Effect.logWarning('job send failed, left for the sweep', error),
          ),
          Effect.ignore,
          Effect.annotateLogs({ jobId: id }),
          sql.afterCommit,
        )
    })

    return { send }
  }),
}) {
  static readonly layer: Layer.Layer<
    JobSender,
    never,
    JobRepository | SqlClient.SqlClient | Crypto.Crypto | SQSService | AwsConfig
  > = Layer.effect(this, this.make).pipe(Layer.provide(QueueSender.layer))
}
