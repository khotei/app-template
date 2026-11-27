import { Effect, Predicate, Schedule } from 'effect'
import { SqlError } from 'effect/sql'

/** Postgres's `cannot_connect_now`: it takes the connection, but is still starting up. */
const cannotConnectNow = '57P03'
const maxRetries = 30

const isConnectionError = (reason: SqlError.SqlErrorReason) => reason._tag === 'ConnectionError'
const isStartingUp = (reason: SqlError.SqlErrorReason) =>
  Predicate.hasProperty(reason.cause, 'code') && reason.cause.code === cannotConnectNow
const isUnreachable = Predicate.or(isConnectionError, isStartingUp)
const isUnreachableError = (error: unknown) =>
  SqlError.isSqlError(error) && isUnreachable(error.reason)

/** How this app's processes reach Postgres. */
export class PostgresConnection {
  /**
   * Retries `self` once a second, for up to 30 seconds, while the database refuses connections;
   * any other failure, a refused password or a failed migration, ends it at once.
   *
   * A database started in the background can take the first connection before it listens.
   */
  static readonly retryWhileUnreachable = <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.retry(self, {
      while: isUnreachableError,
      schedule: Schedule.spaced('1 second').pipe(
        Schedule.upTo({ times: maxRetries }),
        Schedule.tap(() => Effect.logInfo('database not reachable yet, retrying')),
      ),
    })
}
