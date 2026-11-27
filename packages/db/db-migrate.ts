import type { PgClient } from '@effect/sql-pg'
import type { EffectDrizzleQueryError, MigratorInitError } from 'drizzle-orm/effect-core/errors'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql'

import { DbQuery } from '#db/db-query'

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
  Effect.catchTag('EffectDrizzleQueryError', DbQuery.unwrapError),
)
