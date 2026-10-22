import { fileURLToPath } from 'node:url'

import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Array as Arr, Effect, Option } from 'effect'

import { MinimumLogLevelFromConfig } from '@app-template/config'

import { Db } from '#infrastructure/db/db.client'

const migrationsFolder = fileURLToPath(new URL('migrations', import.meta.url))

const selectAppliedCount = Effect.fnUntraced(function* (db: Db['Service']) {
  // The migrator creates its ledger on its first run, so a fresh database has none yet.
  const ledger = yield* db.execute<{ found: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as found`,
    'objects',
  )
  if (!Arr.some(ledger, ({ found }) => found)) return 0

  const counted = yield* db.execute<{ applied: number }>(
    sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
    'objects',
  )
  return Option.match(Arr.head(counted), { onNone: () => 0, onSome: ({ applied }) => applied })
})

/** Applies the pending migrations of `migrations/` and returns how many it applied. */
export const migrateDatabase = Effect.gen(function* () {
  const db = yield* Db
  const before = yield* selectAppliedCount(db)

  // `migrate` reads the folder before it returns its effect, so a missing folder would throw here.
  yield* Effect.suspend(() => migrate(db, { migrationsFolder }))

  const after = yield* selectAppliedCount(db)
  return after - before
})

const logMigrated = (applied: number) =>
  Effect.logInfo(applied === 0 ? 'nothing to apply' : `applied ${applied} migrations`)

if (import.meta.main) {
  await migrateDatabase.pipe(
    Effect.flatMap(logMigrated),
    Effect.provide([Db.layerFromConfig, MinimumLogLevelFromConfig]),
    Effect.orDie,
    Effect.runPromise,
  )
}
