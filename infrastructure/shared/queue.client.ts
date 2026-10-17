import { type Config, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql'

import { QueueConfig, type QueueLockRefreshIntervalInvalidError } from '@oblik/config'
import { createQueueClientSqlite, type QueueClient } from '@oblik/queue'

export const QueueClientSqlite: Layer.Layer<
  QueueClient,
  Config.ConfigError | QueueLockRefreshIntervalInvalidError | SqlError.SqlError
> = Layer.unwrap(Effect.map(QueueConfig, createQueueClientSqlite)).pipe(
  Layer.provide(QueueConfig.layer),
)
