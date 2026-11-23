import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

import { migrateDatabase } from '#db/db-migrate'
import { PgClientTest } from '#testing/db/e2e/postgres.test-layer'

/** A folder of one Effect migration, `0001_probes.ts`, that creates `probes`. */
const probeMigrations = `${import.meta.dirname}/migrations`

describe('migrateDatabase', () => {
  it.effect('applies the folder it is given once, a second call applying nothing', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      // The copy of the template records its own migrations, whose ids would skip the probe's.
      yield* sql`DROP TABLE effect_sql_migrations`

      yield* migrateDatabase(probeMigrations)
      yield* migrateDatabase(probeMigrations)
      const probes = yield* sql`SELECT id FROM probes`
      const applied =
        yield* sql`SELECT migration_id, name FROM effect_sql_migrations WHERE name = 'probes'`

      assert.deepStrictEqual(probes, [])
      assert.deepStrictEqual(applied, [{ migrationId: 1, name: 'probes' }])
    }).pipe(Effect.provide([PgClientTest, BunFileSystem.layer, BunPath.layer])),
  )
})
