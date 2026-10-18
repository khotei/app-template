import { type Config, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql'

import { QueueConfig, type QueueLockRefreshIntervalInvalidError } from '@app-template/config'
import { QueueClient } from '@app-template/queue'

export const QueueClientSqlite: Layer.Layer<
  QueueClient,
  Config.ConfigError | QueueLockRefreshIntervalInvalidError | SqlError.SqlError
> = Layer.unwrap(Effect.map(QueueConfig, QueueClient.layerSqlite)).pipe(
  Layer.provide(QueueConfig.layer),
)
