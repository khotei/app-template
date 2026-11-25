import { assert, describe, it } from '@effect/vitest'
import { defineRelations, sql } from 'drizzle-orm'
import type * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import { Context, Effect, Exit, Layer, type LogLevel, References } from 'effect'
import { SqlClient } from 'effect/sql'

import { recordLogs } from '@app-template/packages/testing'

import { createDb, Transaction } from '#db/db.client'
import { PgClientTest } from '#testing/db/e2e/postgres.test-layer'

const probes = pgTable('probes', { id: integer().primaryKey() })

const relations = defineRelations({ probes })

class Db extends Context.Service<Db, PgDrizzle.EffectPgDatabase<typeof relations>>()(
  '@app-template/packages/db/__e2e__/Db',
  { make: createDb(relations) },
) {
  static readonly layer = Layer.effect(this, this.make)
}

const greet = Db.use((db) =>
  db.execute<{ greeting: string }>(sql`select ${'hello'}::text as greeting`, 'objects'),
)

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

/** `probes` on the test's own database, as the migrated template has no table of this package. */
const createProbes = SqlClient.SqlClient.use(
  (sql) => sql`CREATE TABLE probes (id integer PRIMARY KEY)`,
)

const insertProbe = (id: number) =>
  SqlClient.SqlClient.use((sql) => sql`INSERT INTO probes ${sql.insert({ id })}`)

const selectProbes = SqlClient.SqlClient.use((sql) => sql`SELECT id FROM probes ORDER BY id`)

describe('Transaction', () => {
  it.effect('a run inside a run commits with the outer', () =>
    Effect.gen(function* () {
      const transaction = yield* Transaction
      yield* createProbes

      yield* transaction.run(insertProbe(1).pipe(Effect.andThen(transaction.run(insertProbe(2)))))
      const probes = yield* selectProbes

      assert.deepStrictEqual(probes, [{ id: 1 }, { id: 2 }])
    }).pipe(Effect.provide(Layer.provideMerge(Transaction.layer, PgClientTest))),
  )

  it.effect('a run inside a run that fails rolls back alone, the outer going on', () =>
    Effect.gen(function* () {
      const transaction = yield* Transaction
      yield* createProbes

      yield* transaction.run(
        Effect.gen(function* () {
          yield* insertProbe(1)
          yield* transaction
            .run(insertProbe(2).pipe(Effect.andThen(Effect.fail('refused'))))
            .pipe(Effect.ignore)
          yield* insertProbe(3)
        }),
      )
      const probes = yield* selectProbes

      assert.deepStrictEqual(probes, [{ id: 1 }, { id: 3 }])
    }).pipe(Effect.provide(Layer.provideMerge(Transaction.layer, PgClientTest))),
  )

  it.effect('a run inside a run rolls back with the outer', () =>
    Effect.gen(function* () {
      const transaction = yield* Transaction
      yield* createProbes

      yield* transaction
        .run(transaction.run(insertProbe(1)).pipe(Effect.andThen(Effect.fail('refused'))))
        .pipe(Effect.ignore)
      const probes = yield* selectProbes

      assert.deepStrictEqual(probes, [])
    }).pipe(Effect.provide(Layer.provideMerge(Transaction.layer, PgClientTest))),
  )

  it.effect("run's own SqlError is a defect", () =>
    Effect.gen(function* () {
      const transaction = yield* Transaction
      const client = yield* SqlClient.SqlClient

      // The table does not exist, so the statement itself fails with a SqlError.
      const exit = yield* transaction.run(client`SELECT 1 FROM no_such_table`).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(Layer.provideMerge(Transaction.layer, PgClientTest))),
  )
})
