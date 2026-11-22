import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { Effect, FileSystem, Path } from 'effect'
import { SqlClient } from 'effect/sql'

import { migrateDatabase } from '#db/db-migrate'
import { PgClientTest } from '#testing/db/e2e/postgres.test-layer'

/** A migrations folder of one migration, `20990101000000_probes`, that creates `probes`. */
const writeProbeMigrations = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const folder = yield* fs.makeTempDirectoryScoped()
  const migration = path.join(folder, '20990101000000_probes')

  yield* fs.makeDirectory(migration)
  yield* fs.writeFileString(
    path.join(migration, 'migration.sql'),
    'CREATE TABLE probes (id integer PRIMARY KEY);',
  )
  return folder
})

describe('migrateDatabase', () => {
  it.effect('applies the folder it is given once, a second call applying nothing', () =>
    Effect.gen(function* () {
      const folder = yield* writeProbeMigrations
      const sql = yield* SqlClient.SqlClient

      yield* migrateDatabase(folder)
      yield* migrateDatabase(folder)
      const probes = yield* sql`SELECT id FROM probes`

      assert.deepStrictEqual(probes, [])
    }).pipe(Effect.provide([PgClientTest, BunFileSystem.layer, BunPath.layer])),
  )
})
