import { type Config, DateTime, Effect, Layer, type Schema } from 'effect'

import { buildResourceName } from '@app-template/aws'
import {
  AwsConfig,
  QueueConfig,
  type QueueLockRefreshIntervalInvalidError,
} from '@app-template/config'
import {
  encodeJob,
  QueueConsumer,
  type QueueDefinition,
  QueueSender,
  QueueTransport,
} from '@app-template/queue'

import { Db, orDieWithSqlError } from '#infrastructure/db/db.client'
import { outbox } from '#infrastructure/outbox/outbox.entity'
import { SQSServiceFromConfig } from '#infrastructure/shared/aws.client'

/** Consumes queues on SQS, whose redrive policy moves a spent message to its dead-letter queue. */
export const QueueConsumerSqs: Layer.Layer<
  QueueConsumer,
  Config.ConfigError | QueueLockRefreshIntervalInvalidError
> = Effect.all([QueueConfig, AwsConfig]).pipe(
  Effect.map(([locks, { stage }]) =>
    QueueConsumer.layer({ ...locks, queueName: (name) => buildResourceName(stage, name) }),
  ),
  Layer.unwrap,
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide([QueueConfig.layer, AwsConfig.layer, SQSServiceFromConfig]),
)

/**
 * Writes each job to the `outbox` table, joining the caller's transaction, for `OutboxRelay` to
 * send to SQS.
 */
export const QueueSenderOutbox: Layer.Layer<QueueSender, never, Db> = Layer.effect(
  QueueSender,
  Db.useSync((db) => {
    const send = Effect.fn('QueueSender.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* encodeJob(definition, message)
      const now = yield* DateTime.nowAsDate

      yield* db
        .insert(outbox)
        .values({ queue: definition.name, jobId: definition.jobId(message), body, createdAt: now })
        .pipe(orDieWithSqlError)
    })

    return QueueSender.of({ send })
  }),
)
