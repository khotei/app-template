import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Effect, type LogLevel, References } from 'effect'

import { recordLogs } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { DbTest } from '#infrastructure/testing/db.test-layer'

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
