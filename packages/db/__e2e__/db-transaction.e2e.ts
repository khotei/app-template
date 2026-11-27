import { assert, describe, it } from '@effect/vitest'
import { Effect, Exit, Layer } from 'effect'
import { SqlClient } from 'effect/sql'

import { Transaction } from '#db/db-transaction'
import { PgClientTest } from '#testing/db/e2e/postgres.test-layer'

/** `probes` on the test's own database, as the migrated template has no table of this package. */
const createProbes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql`CREATE TABLE probes (id integer PRIMARY KEY)`
})

const insertProbe = Effect.fnUntraced(function* (id: number) {
  const sql = yield* SqlClient.SqlClient
  return yield* sql`INSERT INTO probes ${sql.insert({ id })}`
})

const selectProbes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql`SELECT id FROM probes ORDER BY id`
})

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
