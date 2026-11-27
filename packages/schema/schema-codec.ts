import { Effect, flow, Schema } from 'effect'

/** A value coded through any codec, a failure a defect. */
export class SchemaCodec {
  static readonly encode = <Codec extends Schema.Constraint>(codec: Codec) =>
    flow(Schema.encodeEffect(codec), Effect.orDie)

  static readonly decode = <Codec extends Schema.Constraint>(codec: Codec) =>
    flow(Schema.decodeEffect(codec), Effect.orDie)
}
