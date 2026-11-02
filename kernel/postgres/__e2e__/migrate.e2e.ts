import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { migrationsFolder } from '@app-template/kernel/data'
import { migrateDatabase } from '@app-template/packages/db'
import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { recordLogs } from '@app-template/packages/testing'

import { applyMigrations } from '#kernel/postgres/migrate'

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
