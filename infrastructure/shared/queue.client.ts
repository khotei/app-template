import { type Config, DateTime, Effect, Layer, type Schema } from 'effect'

import { buildResourceName } from '@app-template/aws'
import {
  AwsConfig,
  QueueConfig,
  type QueueLockRefreshIntervalInvalidError,
} from '@app-template/config'
import { encodeJob, QueueClient, type QueueDefinition, QueueTransport } from '@app-template/queue'

import { Db, orDieWithSqlError } from '#infrastructure/db/db.client'
import { outbox } from '#infrastructure/outbox/outbox.entity'
import { SQSServiceFromConfig } from '#infrastructure/shared/aws.client'

/** Queues on SQS, whose redrive policy moves a spent message to its dead-letter queue. */
export const QueueClientSqs: Layer.Layer<
  QueueClient,
  Config.ConfigError | QueueLockRefreshIntervalInvalidError
> = Layer.unwrap(
  Effect.map(Effect.all([QueueConfig, AwsConfig]), ([locks, { stage }]) =>
    QueueClient.layer({ ...locks, queueName: (name) => buildResourceName(stage, name) }),
  ),
).pipe(
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide([QueueConfig.layer, AwsConfig.layer, SQSServiceFromConfig]),
)

/**
 * Writes each job to the `outbox` table, joining the caller's transaction, for `OutboxRelay` to
 * send to SQS.
 */
export const QueueClientOutbox: Layer.Layer<QueueClient, never, Db> = Layer.effect(
  QueueClient,
  Db.useSync((db) => {
    const send = Effect.fn('QueueClient.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* encodeJob(definition, message)
      const now = yield* DateTime.now

      yield* orDieWithSqlError(
        db.insert(outbox).values({
          queue: definition.name,
          jobId: definition.jobId(message),
          body,
          createdAt: DateTime.toDateUtc(now),
        }),
      )
    })

    return QueueClient.of({
      send,
      consume: () => Effect.die('QueueClientOutbox only sends: the api never consumes'),
    })
  }),
)
