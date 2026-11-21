import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { recordLogs } from '@app-template/packages/testing'

import { applyMigrations } from '#kernel/postgres/postgres-migrate'

describe('applyMigrations', () => {
  it.effect('migrates a database copied from the migrated template, and says so', () => {
    const { logs, layer: recordedLogs } = recordLogs()
    return Effect.gen(function* () {
      yield* applyMigrations

      assert.deepStrictEqual(logs, [['Info', 'database migrated']])
    }).pipe(Effect.provide([PgClientTest, recordedLogs]))
  })
})
