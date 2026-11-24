import { PgClient } from '@effect/sql-pg'
import { Config, type Layer } from 'effect'
import type { SqlClient, SqlError } from 'effect/sql'

import { databaseUrl } from '@app-template/kernel/config'
import { snakeCaseNames } from '@app-template/packages/db'

export const PgClientFromConfig: Layer.Layer<
  PgClient.PgClient | SqlClient.SqlClient,
  Config.ConfigError | SqlError.SqlError
> = PgClient.layerConfig(databaseUrl.pipe(Config.map((url) => ({ url, ...snakeCaseNames }))))
