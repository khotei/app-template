import { PgClient } from '@effect/sql-pg'
import { type Config, Layer } from 'effect'
import type { SqlClient, SqlError } from 'effect/sql'

import { DatabaseConfig } from '@app-template/kernel/config'

export const PgClientFromConfig: Layer.Layer<
  PgClient.PgClient | SqlClient.SqlClient,
  Config.ConfigError | SqlError.SqlError
> = Layer.unwrap(DatabaseConfig.useSync(({ url }) => PgClient.layer({ url }))).pipe(
  Layer.provide(DatabaseConfig.layer),
)
