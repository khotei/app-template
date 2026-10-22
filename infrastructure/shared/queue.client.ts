import { type Config, Effect, Layer } from 'effect'

import { buildResourceName } from '@app-template/aws'
import {
  AwsConfig,
  QueueConfig,
  type QueueLockRefreshIntervalInvalidError,
} from '@app-template/config'
import { QueueClient, QueueTransport } from '@app-template/queue'

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
