import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { migrateDatabase } from '@app-template/db'
import { PgClientTest, recordLogs } from '@app-template/testing'

import { applyMigrations, migrationsFolder } from '#infrastructure/db/migrate'

describe('applyMigrations', () => {
  it.effect('applies nothing to a database copied from the migrated template, and says so', () => {
    const { logs, layer: recordedLogs } = recordLogs()
    return Effect.gen(function* () {
      const applied = yield* migrateDatabase(migrationsFolder)
      yield* applyMigrations

      assert.strictEqual(applied, 0)
      assert.deepStrictEqual(logs, [['Info', 'nothing to apply']])
    }).pipe(Effect.provide([PgClientTest, recordedLogs]))
  })
})
