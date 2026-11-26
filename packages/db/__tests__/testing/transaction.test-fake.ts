import { Effect, identity, Layer } from 'effect'

import { Transaction } from '#db/db.client'

/** Runs each use case as it is, opening no transaction: a unit test takes no write back. */
export const TransactionTest = Layer.succeed(Transaction, Transaction.of({ run: identity }))

/**
 * Runs each use case as it is, with `around` run as it opens and again as it ends well, so a case
 * reads there what was written by then.
 */
export const layerTransactionAround = (around: Effect.Effect<void>) =>
  Layer.succeed(
    Transaction,
    Transaction.of({ run: (effect) => around.pipe(Effect.andThen(effect), Effect.tap(around)) }),
  )
