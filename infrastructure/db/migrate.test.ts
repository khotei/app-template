import { readdirSync } from 'node:fs'

import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Array as Arr, Effect, Layer } from 'effect'

import { PgClientUnauthenticated, recordLogs } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { applyMigrations, migrateDatabase, retryWhileUnreachable } from '#infrastructure/db/migrate'
import { DbTest } from '#infrastructure/db/testing/db'

const DbUnauthenticated = Db.layer.pipe(Layer.provide(PgClientUnauthenticated))

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

  it.effect("fails with the driver's reason when the database refuses the connection", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(migrateDatabase)

      if (error._tag !== 'SqlError') return assert.fail(`expected a SqlError, got ${error._tag}`)
      assert.strictEqual(error.reason._tag, 'AuthenticationError')
    }).pipe(Effect.provide(DbUnauthenticated)),
  )

  // Under the TestClock a retry would wait forever, so a test that ends shows none was made.
  it.effect('gives up at once when the database refuses the password', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(retryWhileUnreachable(migrateDatabase))

      if (error._tag !== 'SqlError') return assert.fail(`expected a SqlError, got ${error._tag}`)
      assert.strictEqual(error.reason._tag, 'AuthenticationError')
    }).pipe(Effect.provide(DbUnauthenticated)),
  )

  it.effect('logs that there is nothing to apply', () => {
    const { logs, layer: recordedLogs } = recordLogs()
    return Effect.map(applyMigrations, () =>
      assert.deepStrictEqual(logs, [['Info', 'nothing to apply']]),
    ).pipe(Effect.provide([DbTest, recordedLogs]))
  })
})
