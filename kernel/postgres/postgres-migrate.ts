import { BunRuntime } from '@effect/platform-bun'
import { Effect } from 'effect'

import { MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import { migrationsFolder } from '@app-template/kernel/data'
import { DbMigration } from '@app-template/packages/db'

import { PgClientFromConfig } from '#kernel/postgres/postgres.client'
import { retryWhileUnreachable } from '#kernel/postgres/postgres-retry'

export const applyMigrations = DbMigration.apply(migrationsFolder).pipe(
  Effect.andThen(Effect.logInfo('database migrated')),
)

if (import.meta.main) {
  BunRuntime.runMain(
    applyMigrations.pipe(
      Effect.provide(PgClientFromConfig),
      // Outside the provide, so each attempt builds the layer and opens a fresh connection.
      retryWhileUnreachable,
      Effect.provide(MinimumLogLevelFromConfig),
    ),
  )
}
