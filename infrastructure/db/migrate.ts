import { fileURLToPath } from 'node:url'

import { BunRuntime } from '@effect/platform-bun'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Array as Arr, Effect, Option, Predicate, Schedule } from 'effect'
import { SqlError } from 'effect/sql'

import { MinimumLogLevelFromConfig } from '@app-template/config'

import { Db, unwrapQueryError } from '#infrastructure/db/db.client'

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
  return Arr.head(counted).pipe(Option.match({ onNone: () => 0, onSome: ({ applied }) => applied }))
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

/** Postgres's `cannot_connect_now`: it takes the connection, but is still starting up. */
const cannotConnectNow = '57P03'
const maxRetries = 30

const isConnectionError = (reason: SqlError.SqlErrorReason) => reason._tag === 'ConnectionError'
const isStartingUp = (reason: SqlError.SqlErrorReason) =>
  Predicate.hasProperty(reason.cause, 'code') && reason.cause.code === cannotConnectNow
const isUnreachable = Predicate.or(isConnectionError, isStartingUp)
const isUnreachableError = (error: unknown) =>
  SqlError.isSqlError(error) && isUnreachable(error.reason)

/**
 * Retries `self` once a second, for up to 30 seconds, while the database refuses connections;
 * any other failure, a refused password or a failed migration, ends it at once.
 *
 * A MiniStack started by `make up` respawns its database in the background, so the first
 * connection can come before the database listens.
 */
export const retryWhileUnreachable = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.retry(self, {
    while: isUnreachableError,
    schedule: Schedule.spaced('1 second').pipe(
      Schedule.upTo({ times: maxRetries }),
      Schedule.tap(() => Effect.logInfo('database not reachable yet, retrying')),
    ),
  })

if (import.meta.main) {
  BunRuntime.runMain(
    applyMigrations.pipe(
      Effect.provide(Db.layerFromConfig),
      // Outside the provide, so each attempt builds the layer and opens a fresh connection.
      retryWhileUnreachable,
      Effect.provide(MinimumLogLevelFromConfig),
    ),
  )
}
