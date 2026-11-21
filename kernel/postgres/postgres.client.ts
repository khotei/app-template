import { PgClient } from '@effect/sql-pg'
import { type Config, Effect, Layer } from 'effect'
import type { SqlClient, SqlError } from 'effect/sql'

import { databaseUrl } from '@app-template/kernel/config'

export const PgClientFromConfig: Layer.Layer<
  PgClient.PgClient | SqlClient.SqlClient,
  Config.ConfigError | SqlError.SqlError
> = databaseUrl.pipe(
  Effect.map((url) => PgClient.layer({ url })),
  Layer.unwrap,
)
