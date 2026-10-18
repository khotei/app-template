import { SqliteClient } from '@effect/sql-sqlite-bun'
import { type Duration, Layer } from 'effect'
import { PersistedQueue } from 'effect/persistence'
import type { SqlError } from 'effect/sql'

import { layerPersisted, type QueueClient } from '#queue/queue'

export interface QueueClientSqliteOptions {
  readonly filename: string
  /** How long a crashed worker's lock holds its message; keep it above `lockRefreshInterval`. */
  readonly lockExpiration: Duration.Input
  readonly lockRefreshInterval: Duration.Input
}

/** A queue in one SQLite file, shared by every process that opens the same file. */
export const layerSqlite = (
  options: QueueClientSqliteOptions,
): Layer.Layer<QueueClient, SqlError.SqlError> =>
  layerPersisted.pipe(
    Layer.provide(
      PersistedQueue.layerStoreSql({
        lockExpiration: options.lockExpiration,
        lockRefreshInterval: options.lockRefreshInterval,
      }),
    ),
    Layer.provide(SqliteClient.layer({ filename: options.filename })),
  )
