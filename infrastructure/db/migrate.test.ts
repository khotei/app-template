import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { recordLogs } from '@app-template/testing'

import { applyMigrations, migrateDatabase } from '#infrastructure/db/migrate'
import { DbTest } from '#infrastructure/db/testing/db'

describe('migrateDatabase', () => {
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
