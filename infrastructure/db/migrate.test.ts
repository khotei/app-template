import { readdirSync } from 'node:fs'

import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Array as Arr, Effect } from 'effect'

import { recordLogs } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { applyMigrations, migrateDatabase } from '#infrastructure/db/migrate'
import { DbTest } from '#infrastructure/db/testing/db'

const migrationFolders = Arr.filter(
  readdirSync(new URL('migrations', import.meta.url), { withFileTypes: true }),
  (entry) => entry.isDirectory(),
)

describe('migrateDatabase', () => {
  it.effect('has applied every migration of the folder to the template', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const ledger = yield* db.execute<{ applied: number }>(
        sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
        'objects',
      )
      assert.deepStrictEqual(ledger, [{ applied: migrationFolders.length }])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('applies nothing to a database copied from the migrated template', () =>
    Effect.map(migrateDatabase, (applied) => assert.strictEqual(applied, 0)).pipe(
      Effect.provide(DbTest),
    ),
  )

  it.effect('logs that there is nothing to apply', () => {
    const { logs, layer: recordedLogs } = recordLogs()
    return Effect.map(applyMigrations, () =>
      assert.deepStrictEqual(logs, [['Info', 'nothing to apply']]),
    ).pipe(Effect.provide([DbTest, recordedLogs]))
  })
})
