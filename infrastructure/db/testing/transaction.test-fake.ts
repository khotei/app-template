import { identity, Layer } from 'effect'

import { Transaction } from '#infrastructure/db/db.client'

/** Runs each use case as it is: the memory layers have no transaction to open. */
export const TransactionTest = Layer.succeed(Transaction, Transaction.of({ run: identity }))
