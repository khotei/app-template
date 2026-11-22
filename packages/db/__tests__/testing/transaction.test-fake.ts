import { identity, Layer } from 'effect'

import { Transaction } from '#db/db.client'

/** Runs each use case as it is, opening no transaction: a unit test takes no write back. */
export const TransactionTest = Layer.succeed(Transaction, Transaction.of({ run: identity }))
