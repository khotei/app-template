import { Context, Effect, Layer, type Predicate } from 'effect'
import { SqlClient } from 'effect/sql'

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
 * Dies with `message` unless the rows a write's `RETURNING` returns satisfy `holds`.
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
