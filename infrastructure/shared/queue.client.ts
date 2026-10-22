import { type Config, Effect, Layer } from 'effect'

import { buildResourceName } from '@app-template/aws'
import {
  AwsConfig,
  QueueConfig,
  type QueueLockRefreshIntervalInvalidError,
} from '@app-template/config'
import { QueueClient } from '@app-template/queue'

import { SQSServiceFromConfig } from '#infrastructure/shared/aws.client'

export const QueueClientSqs: Layer.Layer<
  QueueClient,
  Config.ConfigError | QueueLockRefreshIntervalInvalidError
> = Layer.unwrap(
  Effect.map(Effect.all([QueueConfig, AwsConfig]), ([locks, { stage }]) =>
    QueueClient.layerSqs({ ...locks, queueName: (name) => buildResourceName(stage, name) }),
  ),
).pipe(Layer.provide([QueueConfig.layer, AwsConfig.layer, SQSServiceFromConfig]))
