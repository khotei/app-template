import type { PgClient } from '@effect/sql-pg'
import type { AnyRelations } from 'drizzle-orm'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Effect, Layer } from 'effect'

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

export class DbClient {
  /** Creates a Drizzle database over `relations` on the `PgClient` in the context. */
  static readonly create = <TRelations extends AnyRelations>(
    relations: TRelations,
  ): Effect.Effect<PgDrizzle.EffectPgDatabase<TRelations>, never, PgClient.PgClient> =>
    PgDrizzle.make({ relations }).pipe(
      Effect.provide(Layer.merge(PgDrizzle.DefaultServices, EffectLoggerDebug)),
    )
}
