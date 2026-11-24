import { Schema } from 'effect'

/** An id schema: a UUID branded `brand`. */
export const buildIdSchema = <const B extends string>(
  brand: Parameters<typeof Schema.brand<B>>[0],
) => Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))
