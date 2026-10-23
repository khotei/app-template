import { fileURLToPath } from 'node:url'

import { BunRuntime } from '@effect/platform-bun'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Array as Arr, Effect, Option, Predicate, Schedule } from 'effect'

import { MinimumLogLevelFromConfig } from '@app-template/config'

import { Db, isSqlError, unwrapQueryError } from '#infrastructure/db/db.client'

const migrationsFolder = fileURLToPath(new URL('migrations', import.meta.url))

const selectAppliedCount = Effect.fnUntraced(function* (db: Db['Service']) {
  // The migrator creates its ledger on its first run, so a fresh database has none yet.
  const ledger = yield* db.execute<{ found: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as found`,
    'objects',
  )
  if (!Arr.some(ledger, ({ found }) => found)) return 0

  const counted = yield* db.execute<{ applied: number }>(
    sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
    'objects',
  )
  return Option.match(Arr.head(counted), { onNone: () => 0, onSome: ({ applied }) => applied })
})

/** Applies the pending migrations of `migrations/` and returns how many it applied. */
export const migrateDatabase = Effect.gen(function* () {
  const db = yield* Db
  const before = yield* selectAppliedCount(db)

  // `migrate` reads the folder before it returns its effect, so a missing folder would throw here.
  yield* Effect.suspend(() => migrate(db, { migrationsFolder }))

  const after = yield* selectAppliedCount(db)
  return after - before
}).pipe(Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError))

const describeApplied = (applied: number) => {
  if (applied === 0) return 'nothing to apply'
  return `applied ${applied} migration${applied === 1 ? '' : 's'}`
}

/** `migrateDatabase`, then one `Info` line that says how many migrations it applied. */
export const applyMigrations = Effect.flatMap(migrateDatabase, (applied) =>
  Effect.logInfo(describeApplied(applied)),
)

// 57P03: Postgres accepts the connection but is still starting up.
const isDatabaseUnreachable = (error: unknown) =>
  isSqlError(error) &&
  (error.reason._tag === 'ConnectionError' ||
    (Predicate.hasProperty(error.reason.cause, 'code') && error.reason.cause.code === '57P03'))

/**
 * Retries `self` once a second, for up to 30 seconds, while the database refuses connections;
 * any other failure, a refused password or a failed migration, ends it at once.
 *
 * A MiniStack started by `make up` respawns its database in the background, so the first
 * connection can come before the database listens.
 */
export const retryWhileUnreachable = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  self.pipe(
    Effect.tapError((error) =>
      isDatabaseUnreachable(error)
        ? Effect.logInfo('database not reachable yet, retrying')
        : Effect.void,
    ),
    Effect.retry({
      while: isDatabaseUnreachable,
      schedule: Schedule.spaced('1 second'),
      times: 30,
    }),
  )

if (import.meta.main) {
  BunRuntime.runMain(
    applyMigrations.pipe(
      Effect.provide(Db.layerFromConfig),
      retryWhileUnreachable,
      Effect.provide(MinimumLogLevelFromConfig),
    ),
  )
}
