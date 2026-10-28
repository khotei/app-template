import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Effect, Exit, Layer, type LogLevel, References } from 'effect'
import { SqlClient } from 'effect/sql'

import { owner } from '@app-template/domain/testing'
import { recordLogs } from '@app-template/testing'

import { Db, Transaction } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db.test-layer'
import { insertUser } from '#infrastructure/testing/rows.test-util'
import { users } from '#infrastructure/user/user.entity'

const greet = Effect.flatMap(Db, (db) =>
  db.execute<{ greeting: string }>(sql`select ${'hello'}::text as greeting`, 'objects'),
)

describe('Db', () => {
  it.effect.each<{ level: LogLevel.LogLevel; expected: ReadonlyArray<ReadonlyArray<unknown>> }>([
    {
      level: 'Debug',
      expected: [['Debug', 'sql', 'select $1::text as greeting', ['hello']]],
    },
    { level: 'Info', expected: [] },
  ])('logs a statement with its parameters at $level', ({ level, expected }) => {
    const { logs, layer: recordedLogs } = recordLogs('query', 'params')
    return Effect.map(greet, () => assert.deepStrictEqual(logs, expected)).pipe(
      Effect.provide([DbTest, recordedLogs]),
      Effect.provideService(References.MinimumLogLevel, level),
    )
  })
})

const TransactionPgTest = Transaction.layer.pipe(Layer.provideMerge(DbTest))

const selectUserIds = Effect.flatMap(Db, (db) => db.select({ id: users.id }).from(users))

describe('Transaction', () => {
  it.effect('run keeps no write of a step when a later one is refused', () =>
    Effect.gen(function* () {
      const transaction = yield* Transaction

      yield* flipSqlError(transaction.run(Effect.andThen(insertUser(owner), insertUser(owner))))

      assert.deepStrictEqual(yield* selectUserIds, [])
    }).pipe(Effect.provide(TransactionPgTest)),
  )

  it.effect("run's own SqlError is a defect", () =>
    Effect.gen(function* () {
      const transaction = yield* Transaction
      const sql = yield* SqlClient.SqlClient

      const exit = yield* Effect.exit(transaction.run(sql`SELECT 1 FROM no_such_table`))

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(TransactionPgTest)),
  )
})
