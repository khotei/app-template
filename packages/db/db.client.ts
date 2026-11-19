import type { PgClient } from '@effect/sql-pg'
import type { AnyRelations } from 'drizzle-orm'
import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Cause, Context, Effect, Layer, type Predicate, Schema } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'

/**
 * Logs each statement at `Debug`, with its SQL and parameters as the `query` and `params`
 * annotations.
 *
 * Drizzle's own `EffectLogger.layer` logs at `Info`, which would print every statement in
 * production.
 */
const EffectLoggerDebug = Layer.succeed(PgDrizzle.EffectLogger, {
  logQuery: (query, params) => Effect.logDebug('sql').pipe(Effect.annotateLogs({ query, params })),
})

/** Creates a Drizzle database over `relations` on the `PgClient` in the context. */
export const createDb = <TRelations extends AnyRelations>(
  relations: TRelations,
): Effect.Effect<PgDrizzle.EffectPgDatabase<TRelations>, never, PgClient.PgClient> =>
  PgDrizzle.make({ relations }).pipe(
    Effect.provide(Layer.merge(PgDrizzle.DefaultServices, EffectLoggerDebug)),
  )

export class Transaction extends Context.Service<
  Transaction,
  {
    /** Runs `self` in one transaction; its own `SqlError` is a defect. */
    readonly run: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  }
>()('@app-template/packages/db/Transaction') {
  static readonly layer = Layer.effect(
    this,
    SqlClient.SqlClient.useSync((sql) =>
      this.of({
        run: (self) => sql.withTransaction(self).pipe(Effect.catchTag('SqlError', Effect.die)),
      }),
    ),
  )
}

/**
 * Fails with the `SqlError` a Drizzle query error wraps, whose reason and driver message the
 * wrapper's own message leaves out.
 *
 * Drizzle types the wrapped cause `unknown`, but its Effect driver only ever wraps a `SqlError`,
 * so anything else is a bug and dies.
 */
export function unwrapQueryError(error: EffectDrizzleQueryError) {
  const cause = Cause.isCause(error.cause) ? Cause.squash(error.cause) : error.cause
  return SqlError.isSqlError(cause) ? Effect.fail(cause) : Effect.die(error)
}

const isQueryError = Schema.is(EffectDrizzleQueryError)

/**
 * Dies with `message` unless the rows a write's `RETURNING` answers satisfy `holds`.
 *
 * The caller checked the rule before writing, so a write the guard refuses only lost a race.
 */
export const orDieUnless =
  (holds: Predicate.Predicate<ReadonlyArray<unknown>>, message: string) =>
  <A, E, R>(self: Effect.Effect<ReadonlyArray<A>, E, R>): Effect.Effect<void, E, R> =>
    self.pipe(
      Effect.filterOrElse(holds, () => Effect.die(new Error(message))),
      Effect.asVoid,
    )

/** Turns every failure into a defect, a Drizzle query error as the `SqlError` it wraps. */
export const orDieWithSqlError = <A, E, R>(
  self: Effect.Effect<A, E | EffectDrizzleQueryError, R>,
): Effect.Effect<A, never, R> =>
  self.pipe(Effect.catchIf(isQueryError, unwrapQueryError), Effect.orDie)
