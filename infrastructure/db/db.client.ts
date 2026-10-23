import { PgClient } from '@effect/sql-pg'
import { EffectCache } from 'drizzle-orm/cache/core/cache-effect'
import { EffectLogger } from 'drizzle-orm/effect-core'
import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Cause, Context, Effect, Layer, Schema } from 'effect'
import { SqlError } from 'effect/sql'

import { DatabaseConfig } from '@app-template/config'

/**
 * Logs each statement at `Debug`, with its SQL and parameters as the `query` and `params`
 * annotations.
 *
 * Drizzle's own `EffectLogger.layer` logs at `Info`, which would print every statement in
 * production.
 */
const EffectLoggerDebug = Layer.succeed(EffectLogger, {
  logQuery: (query, params) => Effect.logDebug('sql').pipe(Effect.annotateLogs({ query, params })),
})

const PgClientFromConfig = Layer.unwrap(
  Effect.map(DatabaseConfig, ({ url }) => PgClient.layer({ url })),
).pipe(Layer.provide(DatabaseConfig.layer))

export class Db extends Context.Service<Db, PgDrizzle.EffectPgDatabase>()(
  '@app-template/infrastructure/db/Db',
  { make: PgDrizzle.make() },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([EffectCache.Default, EffectLoggerDebug]),
  )

  /** Publishes the `PgClient` too, so callers open transactions on the connection `Db` uses. */
  static readonly layerFromConfig = this.layer.pipe(Layer.provideMerge(PgClientFromConfig))
}

export const isSqlError = Schema.is(SqlError.SqlError)

/**
 * Fails with the `SqlError` a Drizzle query error wraps, whose reason and driver message the
 * wrapper's own message leaves out.
 *
 * Drizzle types the wrapped cause `unknown`, but its Effect driver only ever wraps a `SqlError`,
 * so anything else is a bug and dies.
 */
export const unwrapQueryError = (error: EffectDrizzleQueryError) => {
  const cause = Cause.isCause(error.cause) ? Cause.squash(error.cause) : error.cause
  return isSqlError(cause) ? Effect.fail(cause) : Effect.die(error)
}

const isQueryError = Schema.is(EffectDrizzleQueryError)

/** Turns every failure into a defect, a Drizzle query error as the `SqlError` it wraps. */
export const orDieWithSqlError = <A, E, R>(
  self: Effect.Effect<A, E | EffectDrizzleQueryError, R>,
): Effect.Effect<A, never, R> =>
  self.pipe(Effect.catchIf(isQueryError, unwrapQueryError), Effect.orDie)
