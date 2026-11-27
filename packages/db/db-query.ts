import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Cause, Effect, Schema } from 'effect'
import { SqlError } from 'effect/sql'

const isQueryError = Schema.is(EffectDrizzleQueryError)

/** How a Drizzle query's failure reaches its caller: as the `SqlError` its wrapper holds. */
export class DbQuery {
  /**
   * Fails with the `SqlError` a Drizzle query error wraps, whose reason and driver message the
   * wrapper's own message leaves out.
   *
   * Drizzle types the wrapped cause `unknown`, but its Effect driver only ever wraps a `SqlError`,
   * so anything else is a bug and dies.
   */
  static readonly unwrapError = (error: EffectDrizzleQueryError) => {
    const cause = Cause.isCause(error.cause) ? Cause.squash(error.cause) : error.cause
    return SqlError.isSqlError(cause) ? Effect.fail(cause) : Effect.die(error)
  }

  /** Turns every failure into a defect, a Drizzle query error as the `SqlError` it wraps. */
  static readonly orDie = <A, E, R>(
    self: Effect.Effect<A, E | EffectDrizzleQueryError, R>,
  ): Effect.Effect<A, never, R> =>
    self.pipe(Effect.catchIf(isQueryError, DbQuery.unwrapError), Effect.orDie)
}
