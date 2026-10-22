import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Array as Arr, Effect, type LogLevel, Option, References } from 'effect'

import { recordLogs } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { DbTest } from '#infrastructure/db/testing/db'

const greet = Effect.flatMap(Db, (db) =>
  db.execute<{ greeting: string }>(sql`select ${'hello'}::text as greeting`, 'objects'),
)

const selectNoteTable = Effect.flatMap(Db, (db) =>
  db.execute<{ found: boolean }>(sql`select to_regclass('note') is not null as found`, 'objects'),
)

describe('Db', () => {
  it.effect('runs a statement and returns its rows', () =>
    Effect.map(greet, (rows) => assert.deepStrictEqual(rows, [{ greeting: 'hello' }])).pipe(
      Effect.provide(DbTest),
    ),
  )

  it.effect('runs on a database of its own, not the admin one', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const rows = yield* db.execute<{ name: string }>(
        sql`select current_database() as name`,
        'objects',
      )
      assert.match(Option.getOrThrow(Arr.head(rows)).name, /^test_/)
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('gives each test a fresh database, so no row outlives its test', () =>
    Effect.gen(function* () {
      yield* Effect.flatMap(Db, (db) =>
        db.execute(sql`create table note as select 'kept' as body`),
      ).pipe(Effect.provide(DbTest))
      const inNextDatabase = yield* selectNoteTable.pipe(Effect.provide(DbTest))
      assert.deepStrictEqual(inNextDatabase, [{ found: false }])
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
      Effect.provide([DbTest, recordedLogs]),
      Effect.provideService(References.MinimumLogLevel, level),
    )
  })
})
