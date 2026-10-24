import { PgClient } from '@effect/sql-pg'
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Layer, Option, Redacted } from 'effect'
import { TestClock } from 'effect/testing'
import { inject } from 'vitest'

import { PgClientTest } from '#testing/postgres'

const PgClientAdmin = Layer.unwrap(
  Effect.sync(() => PgClient.layer({ url: Redacted.make(inject('databaseUrl')) })),
)

const selectCurrentDatabase = Effect.flatMap(
  PgClient.PgClient,
  (client) => client<{ readonly name: string }>`select current_database() as name`,
)

const selectDatabasesNamed = (name: string) =>
  Effect.flatMap(
    PgClient.PgClient,
    (client) =>
      client<{ readonly datname: string }>`select datname from pg_database where datname = ${name}`,
  )

describe('PgClientTest', () => {
  it.effect('drops its test_ database once the scope that provided it closes', () =>
    Effect.gen(function* () {
      const rows = yield* selectCurrentDatabase.pipe(Effect.provide(PgClientTest))
      const { name } = Option.getOrThrow(Arr.head(rows))
      const left = yield* selectDatabasesNamed(name).pipe(Effect.provide(PgClientAdmin))

      assert.match(name, /^test_/)
      assert.deepStrictEqual(left, [])
    }),
  )

  it.effect('keeps answering after the test clock is set years ahead', () =>
    Effect.gen(function* () {
      yield* selectCurrentDatabase
      yield* TestClock.setTime(Date.parse('2026-10-18T12:00:00.000Z'))

      const rows = yield* selectCurrentDatabase

      assert.strictEqual(rows.length, 1)
    }).pipe(Effect.provide(PgClientTest)),
  )
})
