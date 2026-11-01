import { BunRuntime } from '@effect/platform-bun'
import { Effect } from 'effect'

import { migrateDatabase, retryWhileUnreachable } from '@app-template/db'

import { MinimumLogLevelFromConfig } from '#kernel/config/config'
import { migrationsFolder } from '#kernel/data/migrations'
import { PgClientFromConfig } from '#kernel/postgres/postgres.client'

const describeApplied = (applied: number) => {
  if (applied === 0) return 'nothing to apply'
  return `applied ${applied} migration${applied === 1 ? '' : 's'}`
}

/** `migrateDatabase` over `migrations/`, then one `Info` line that says how many it applied. */
export const applyMigrations = migrateDatabase(migrationsFolder).pipe(
  Effect.flatMap((applied) => Effect.logInfo(describeApplied(applied))),
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
