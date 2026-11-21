import type { PgClient } from '@effect/sql-pg'
import type { EffectDrizzleQueryError, MigratorInitError } from 'drizzle-orm/effect-core/errors'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Effect, Predicate, Schedule } from 'effect'
import { SqlError } from 'effect/sql'

import { unwrapQueryError } from '#db/db.client'

/** Applies the pending migrations of `folder`. */
export const migrateDatabase = Effect.fn('migrateDatabase')(
  function* (
    folder: string,
  ): Effect.fn.Return<
    void,
    EffectDrizzleQueryError | MigratorInitError | SqlError.SqlError,
    PgClient.PgClient
  > {
    const db = yield* PgDrizzle.makeWithDefaults()

    // `migrate` reads the folder before it returns its effect, so a missing folder would throw here.
    yield* Effect.suspend(() => migrate(db, { migrationsFolder: folder }))
  },
  Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError),
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
