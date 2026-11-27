import { assert, describe, it } from '@effect/vitest'
import { defineRelations, sql } from 'drizzle-orm'
import type * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import { Context, Effect, Layer, type LogLevel, References } from 'effect'

import { recordLogs } from '@app-template/packages/testing'

import { createDb } from '#db/db.client'
import { PgClientTest } from '#testing/db/e2e/postgres.test-layer'

const probes = pgTable('probes', { id: integer().primaryKey() })

const relations = defineRelations({ probes })

class Db extends Context.Service<Db, PgDrizzle.EffectPgDatabase<typeof relations>>()(
  '@app-template/packages/db/__e2e__/Db',
  { make: createDb(relations) },
) {
  static readonly layer = Layer.effect(this, this.make)
}

const greet = Effect.gen(function* () {
  const db = yield* Db
  return yield* db.execute<{ greeting: string }>(
    sql`select ${'hello'}::text as greeting`,
    'objects',
  )
})

describe('createDb', () => {
  it.effect.each<{ level: LogLevel.LogLevel; expected: ReadonlyArray<ReadonlyArray<unknown>> }>([
    {
      level: 'Debug',
      expected: [['Debug', 'sql', 'select $1::text as greeting', ['hello']]],
    },
    { level: 'Info', expected: [] },
  ])('logs a statement with its parameters at $level', ({ level, expected }) => {
    const { logs, layer: recordedLogs } = recordLogs('query', 'params')
    return greet.pipe(
      Effect.map(() => assert.deepStrictEqual(logs, expected)),
      Effect.provide([Db.layer.pipe(Layer.provide(PgClientTest)), recordedLogs]),
      Effect.provideService(References.MinimumLogLevel, level),
    )
  })
})
