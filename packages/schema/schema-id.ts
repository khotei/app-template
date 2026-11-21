import { Effect, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'

/** An id schema: a UUID branded `brand`. */
export const buildIdSchema = <const B extends string>(
  brand: Parameters<typeof Schema.brand<B>>[0],
) => Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))

/**
 * The id generator over the context's `SecureRandom`: a fresh UUIDv7 branded by the schema's
 * `make`. A service yields it once in its `make`, so its methods require no `SecureRandom`.
 */
export const idGenerator = SecureRandom.SecureRandom.useSync(
  (random) =>
    <Id>(schema: { readonly make: (uuid: string) => Id }): Effect.Effect<Id> =>
      random.uuidV7().pipe(Effect.map(schema.make)),
)
