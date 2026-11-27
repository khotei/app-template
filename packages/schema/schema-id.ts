import { Schema } from 'effect'

export class SchemaId {
  /** An id schema: a UUID branded `brand`. */
  static readonly build = <const B extends string>(brand: Parameters<typeof Schema.brand<B>>[0]) =>
    Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))
}
