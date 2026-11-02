import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Fiber, FileSystem, Path } from 'effect'
import { SqlClient } from 'effect/sql'
import {
  AuthenticationError,
  ConnectionError,
  SqlError,
  type SqlErrorReason,
  UnknownError,
} from 'effect/sql/SqlError'
import { TestClock } from 'effect/testing'

import { recordLogs } from '@app-template/packages/testing'

import { migrateDatabase, retryWhileUnreachable } from '#db/migrate'
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
  it.effect('applies the folder it is given and answers how many it applied', () =>
    Effect.gen(function* () {
      const folder = yield* writeProbeMigrations
      const sql = yield* SqlClient.SqlClient

      const applied = yield* migrateDatabase(folder)
      const again = yield* migrateDatabase(folder)
      const probes = yield* sql`SELECT id FROM probes`

      assert.strictEqual(applied, 1)
      assert.strictEqual(again, 0)
      assert.deepStrictEqual(probes, [])
    }).pipe(Effect.scoped, Effect.provide([PgClientTest, BunFileSystem.layer, BunPath.layer])),
  )
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

      const fiber = yield* retryWhileUnreachable(connect).pipe(
        Effect.provide(recordedLogs),
        Effect.forkChild,
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

      const fiber = yield* retryWhileUnreachable(connect).pipe(
        Effect.flip,
        Effect.provide(recordedLogs),
        Effect.forkChild,
      )
      yield* TestClock.adjust('1 minute')
      const error = yield* Fiber.join(fiber)

      assert.strictEqual(error.reason._tag, 'ConnectionError')
      assert.strictEqual(attempts(), 31)
      assert.strictEqual(logs.length, 30)
    }),
  )

  it.effect('fails at once on a refusal other than unreachable, such as a wrong password', () =>
    Effect.gen(function* () {
      const { connect, attempts } = refuseConnections(
        new AuthenticationError({
          cause: new Error('password authentication failed'),
          operation: 'connect',
        }),
        Infinity,
      )

      const error = yield* retryWhileUnreachable(connect).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'AuthenticationError')
      assert.strictEqual(attempts(), 1)
    }),
  )
})
