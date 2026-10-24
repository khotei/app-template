import { readdirSync } from 'node:fs'

import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Array as Arr, Effect, Fiber, Layer } from 'effect'
import { ConnectionError, SqlError, type SqlErrorReason, UnknownError } from 'effect/sql/SqlError'
import { TestClock } from 'effect/testing'

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

  it.effect('logs that there is nothing to apply', () => {
    const { logs, layer: recordedLogs } = recordLogs()
    return Effect.map(applyMigrations, () =>
      assert.deepStrictEqual(logs, [['Info', 'nothing to apply']]),
    ).pipe(Effect.provide([DbTest, recordedLogs]))
  })
})

const refusals = {
  'a closed port': new ConnectionError({ cause: new Error('ECONNREFUSED'), operation: 'connect' }),
  'a database still starting up': new UnknownError({
    cause: Object.assign(new Error('the database system is starting up'), { code: '57P03' }),
    operation: 'connect',
  }),
} as const

/** Fails with `reason` on the first `times` attempts, then succeeds; counts the attempts. */
const refuseConnections = (reason: SqlErrorReason, times: number) => {
  let attempts = 0
  const connect = Effect.suspend(() => {
    attempts += 1
    return attempts <= times ? Effect.fail(new SqlError({ reason })) : Effect.succeed('connected')
  })
  return { connect, attempts: () => attempts }
}

const retryingLine = ['Info', 'database not reachable yet, retrying']

describe('retryWhileUnreachable', () => {
  it.effect.each(Object.entries(refusals))('retries %s until the database answers', ([, reason]) =>
    Effect.gen(function* () {
      const { logs, layer: recordedLogs } = recordLogs()
      const { connect, attempts } = refuseConnections(reason, 3)

      const fiber = yield* Effect.forkChild(
        retryWhileUnreachable(connect).pipe(Effect.provide(recordedLogs)),
      )
      yield* TestClock.adjust('3 seconds')
      const result = yield* Fiber.join(fiber)

      assert.strictEqual(result, 'connected')
      assert.strictEqual(attempts(), 4)
      assert.deepStrictEqual(logs, Arr.replicate(retryingLine, 3))
    }),
  )

  it.effect('gives up after 30 retries, logging none after the last', () =>
    Effect.gen(function* () {
      const { logs, layer: recordedLogs } = recordLogs()
      const { connect, attempts } = refuseConnections(refusals['a closed port'], Infinity)

      const fiber = yield* Effect.forkChild(
        Effect.flip(retryWhileUnreachable(connect)).pipe(Effect.provide(recordedLogs)),
      )
      yield* TestClock.adjust('1 minute')
      const error = yield* Fiber.join(fiber)

      assert.strictEqual(error.reason._tag, 'ConnectionError')
      assert.strictEqual(attempts(), 31)
      assert.strictEqual(logs.length, 30)
    }),
  )

  // Under the TestClock a retry would wait forever, so a test that ends shows none was made.
  it.effect("fails at once with the driver's reason when the database refuses the password", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(retryWhileUnreachable(migrateDatabase))

      if (error._tag !== 'SqlError') return assert.fail(`expected a SqlError, got ${error._tag}`)
      assert.strictEqual(error.reason._tag, 'AuthenticationError')
    }).pipe(Effect.provide(DbUnauthenticated)),
  )
})
