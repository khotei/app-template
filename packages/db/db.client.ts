import type { PgClient } from '@effect/sql-pg'
import type { AnyRelations } from 'drizzle-orm'
import { EffectCache } from 'drizzle-orm/cache/core/cache-effect'
import { EffectLogger } from 'drizzle-orm/effect-core'
import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Array as Arr, Cause, Context, Effect, flow, Layer, Predicate, Schema } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'

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

/** Creates a Drizzle database over `relations` on the `PgClient` in the context. */
export const createDb = <TRelations extends AnyRelations>(
  relations: TRelations,
): Effect.Effect<PgDrizzle.EffectPgDatabase<TRelations>, never, PgClient.PgClient> =>
  PgDrizzle.make({ relations }).pipe(Effect.provide([EffectCache.Default, EffectLoggerDebug]))

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

/** Decodes the row a read found, or answers `Option.none()` when it found none. */
export const decodeOptionalRow = <S extends Schema.Constraint>(schema: S) =>
  Schema.decodeEffect(Schema.OptionFromNullishOr(schema))

/**
 * Encodes a model through its mapper and decodes the result with the row's insert schema, which
 * drops the fields the table lacks and checks the row; a failure is a defect.
 */
export const encodeRowWith = <
  Row extends Schema.Constraint,
  Mapper extends Schema.ConstraintCodec<unknown, Row['Encoded'], unknown, unknown>,
>(
  mapper: Mapper,
  row: Row,
) => flow(Schema.encodeEffect(mapper), Effect.flatMap(Schema.decodeEffect(row)), Effect.orDie)

/** Decodes the entity a read found, if any, through its mapper; a failure is a defect. */
export const decodeOptionalWith = <Mapper extends Schema.Constraint>(mapper: Mapper) =>
  flow(Schema.decodeEffect(Schema.Option(mapper)), Effect.orDie)

/** Decodes the entities a read found through their mapper; a failure is a defect. */
export const decodeManyWith = <Mapper extends Schema.Constraint>(mapper: Mapper) =>
  flow(Schema.decodeEffect(Schema.Array(mapper)), Effect.orDie)

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
 * Holds when a write's `RETURNING` answers one row per distinct id of `ids`: a write over a list
 * misses none of the rows it names.
 */
export const hasRowPer = (ids: string | ReadonlyArray<string>) =>
  Predicate.and(
    Arr.isReadonlyArrayNonEmpty<unknown>,
    (rows: ReadonlyArray<unknown>) => rows.length === Arr.dedupe(Arr.ensure(ids)).length,
  )

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
