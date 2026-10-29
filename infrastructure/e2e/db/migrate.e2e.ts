import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Fiber } from 'effect'
import {
  AuthenticationError,
  ConnectionError,
  SqlError,
  type SqlErrorReason,
  UnknownError,
} from 'effect/sql/SqlError'
import { TestClock } from 'effect/testing'

import { recordLogs } from '@app-template/testing'

import { applyMigrations, migrateDatabase, retryWhileUnreachable } from '#infrastructure/db/migrate'
import { DbTest } from '#infrastructure/db/testing/db.test-layer'

describe('applyMigrations', () => {
  it.effect('applies nothing to a database copied from the migrated template, and says so', () => {
    const { logs, layer: recordedLogs } = recordLogs()
    return Effect.gen(function* () {
      const applied = yield* migrateDatabase
      yield* applyMigrations

      assert.strictEqual(applied, 0)
      assert.deepStrictEqual(logs, [['Info', 'nothing to apply']])
    }).pipe(Effect.provide([DbTest, recordedLogs]))
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
