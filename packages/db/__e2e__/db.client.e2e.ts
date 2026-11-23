import { assert, describe, it } from '@effect/vitest'
import { Effect, Exit, Layer } from 'effect'
import { SqlClient } from 'effect/sql'

import { Transaction } from '#db/db.client'
import { PgClientTest } from '#testing/db/e2e/postgres.test-layer'

describe('Transaction', () => {
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
