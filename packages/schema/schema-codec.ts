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

/**
 * Makes a value through `codec`'s constructor, its defaults applied, and encodes its row: `set`
 * is the value, `row` what a store writes. A value the schema refuses fails with its
 * `SchemaIssue`, for the caller to settle; a failed encode is a defect.
 */
export const makeRowWith = <Codec extends Schema.Top>(codec: Codec) =>
  Effect.fnUntraced(function* (input: Codec['~type.make.in']) {
    const set = yield* codec.makeEffect(input)
    const row = yield* encodeWith(codec)(set)
    return { set, row }
  })

/**
 * Makes an update's row through `codec` as `makeRowWith` does, from the input without its own
 * `updatedAt`, so the variant's default moves it to now; the input may be a record as read.
 */
export const makeUpdateWith =
  <Codec extends Schema.Top & { readonly '~type.make.in': object }>(codec: Codec) =>
  (input: Omit<Codec['~type.make.in'], 'updatedAt'> & { readonly updatedAt?: unknown }) => {
    const { updatedAt: _, ...fields } = input
    return makeRowWith(codec)(fields)
  }
