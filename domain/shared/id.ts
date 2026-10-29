import { type Crypto, Effect } from 'effect'

/** A fresh UUIDv7 branded by `make`; a `Crypto` failure is a defect. */
export const generateId = <Id>(
  crypto: Crypto.Crypto,
  make: (uuid: string) => Id,
): Effect.Effect<Id> => crypto.randomUUIDv7().pipe(Effect.orDie, Effect.map(make))
