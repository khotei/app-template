import type { SQSService } from '@effect-aws/client-sqs'
import { type Config, DateTime, Effect, Layer, type Schema } from 'effect'

import { buildResourceName } from '@app-template/kernel/aws'
import {
  AwsConfig,
  QueueConfig,
  type QueueLockRefreshIntervalInvalidError,
} from '@app-template/kernel/config'
import { JobRepository } from '@app-template/kernel/data'
import {
  encodeJob,
  QueueConsumer,
  type QueueDefinition,
  QueueSender,
  QueueTransport,
} from '@app-template/packages/queue'

/** Consumes queues on SQS, whose redrive policy moves a spent message to its dead-letter queue. */
export const QueueConsumerSqs: Layer.Layer<
  QueueConsumer,
  Config.ConfigError | QueueLockRefreshIntervalInvalidError,
  SQSService
> = Effect.all([QueueConfig, AwsConfig]).pipe(
  Effect.map(([locks, { stage }]) =>
    QueueConsumer.layer({ ...locks, queueName: (name) => buildResourceName(stage, name) }),
  ),
  Layer.unwrap,
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide([QueueConfig.layer, AwsConfig.layer]),
)

/**
 * Writes each job to the `jobs` table, joining the caller's transaction, for `JobRelay` to send
 * to SQS.
 */
export const QueueSenderJobs: Layer.Layer<QueueSender, never, JobRepository> = Layer.effect(
  QueueSender,
  JobRepository.useSync((jobs) => {
    const send = Effect.fn('QueueSender.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* encodeJob(definition, message)
      const now = yield* DateTime.nowAsDate

      yield* jobs.insert({
        queue: definition.name,
        jobId: definition.jobId(message),
        body,
        createdAt: now,
      })
    })

    return QueueSender.of({ send })
  }),
)
