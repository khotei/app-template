import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Effect } from 'effect'

import { Db } from '#infrastructure/db/db.client'

const migrationsFolder = fileURLToPath(new URL('migrations', import.meta.url))

/** Applies the pending migrations of `migrations/`; a database with none pending is left as is. */
export const migrateDatabase = Effect.gen(function* () {
  const db = yield* Db

  // `migrate` reads the folder before it returns its effect, so a missing folder would throw here.
  yield* Effect.suspend(() => migrate(db, { migrationsFolder }))
})

if (import.meta.main) {
  await migrateDatabase.pipe(
    Effect.andThen(Effect.logInfo('migrations applied')),
    Effect.provide(Db.layerFromConfig),
    Effect.orDie,
    Effect.runPromise,
  )
}
