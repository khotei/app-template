import { PgMigrator } from '@effect/sql-pg'
import { Effect, Predicate, Schedule } from 'effect'
import { Migrator, SqlError } from 'effect/sql'

/**
 * Effect's migrator with no schema dump: `PgMigrator.run` adds one through `pg_dump`, and needs a
 * child process spawner for it even when no dump is asked.
 */
const runMigrations = Migrator.make({})

/**
 * Applies the pending migrations of `folder`: its `<id>_<name>.ts` modules, each an `Effect` as
 * its default export, recorded by id in `effect_sql_migrations`.
 */
export const migrateDatabase = Effect.fn('migrateDatabase')(
  (folder: string) => runMigrations({ loader: PgMigrator.fromFileSystem(folder) }),
  Effect.asVoid,
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
 * A database started in the background can take the first connection before it listens.
 */
export const retryWhileUnreachable = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.retry(self, {
    while: isUnreachableError,
    schedule: Schedule.spaced('1 second').pipe(
      Schedule.upTo({ times: maxRetries }),
      Schedule.tap(() => Effect.logInfo('database not reachable yet, retrying')),
    ),
  })
