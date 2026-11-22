import { Effect, flow, Schema } from 'effect'

/** Encodes a value through `codec`; a failure is a defect. */
export const encodeWith = <Codec extends Schema.Constraint>(codec: Codec) =>
  flow(Schema.encodeEffect(codec), Effect.orDie)

/**
 * Decodes a value through `codec`; a failure is a defect. A read's rows decode through the
 * codec of its shape, `Schema.Option(<Model>)` for one row and `Schema.Array(<Model>)` for many.
 */
export const decodeWith = <Codec extends Schema.Constraint>(codec: Codec) =>
  flow(Schema.decodeEffect(codec), Effect.orDie)
