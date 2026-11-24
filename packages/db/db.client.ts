import { Context, Effect, Layer } from 'effect'
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
