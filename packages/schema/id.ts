import { Crypto, Effect, Schema } from 'effect'

/** An id schema: a UUID branded `brand`. */
export const buildIdSchema = <const B extends string>(
  brand: Parameters<typeof Schema.brand<B>>[0],
) => Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))

/**
 * The id generator over the context's `Crypto`: a fresh UUIDv7 branded by the schema's `make`.
 * A service yields it once in its `make`, so its methods require no `Crypto`; a `Crypto` failure
 * is a defect.
 */
export const idGenerator = Crypto.Crypto.useSync(
  (crypto) =>
    <Id>(schema: { readonly make: (uuid: string) => Id }): Effect.Effect<Id> =>
      crypto.randomUUIDv7().pipe(Effect.orDie, Effect.map(schema.make)),
)
