import { assert, describe, layer } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Effect, Layer, type LogLevel, References } from 'effect'

import { PgClientTest, recordLogs } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'

const DbTest = Db.layer.pipe(Layer.provide(PgClientTest))

const greet = Effect.flatMap(Db, (db) =>
  db.execute<{ greeting: string }>(sql`select ${'hello'}::text as greeting`, 'objects'),
)

describe('Db', () => {
  layer(DbTest)((it) => {
    it.effect('runs a statement and returns its rows', () =>
      Effect.map(greet, (rows) => assert.deepStrictEqual(rows, [{ greeting: 'hello' }])),
    )

    it.effect('runs on a database of its own, not the admin one', () =>
      Effect.gen(function* () {
        const db = yield* Db
        const [row] = yield* db.execute<{ name: string }>(
          sql`select current_database() as name`,
          'objects',
        )

        assert.match(row?.name ?? '', /^test_/)
      }),
    )

    it.effect.each<{ level: LogLevel.LogLevel; expected: ReadonlyArray<ReadonlyArray<unknown>> }>([
      {
        level: 'Debug',
        expected: [['Debug', 'sql', 'select $1::text as greeting', ['hello']]],
      },
      { level: 'Info', expected: [] },
    ])('logs a statement with its parameters at $level', ({ level, expected }) => {
      const { logs, layer: recordedLogs } = recordLogs('query', 'params')
      return Effect.map(greet, () => assert.deepStrictEqual(logs, expected)).pipe(
        Effect.provide(recordedLogs),
        Effect.provideService(References.MinimumLogLevel, level),
      )
    })
  })
})
