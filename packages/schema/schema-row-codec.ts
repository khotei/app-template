import { type Brand, Effect, Predicate, Schema, Struct } from 'effect'
import type { Model } from 'effect/schema'

import { decodeWith, encodeWith } from '#schema/schema-codec'

/** A model whose update variant is a struct, as a `Model.Class`'s is. */
type UpdatableModel = Model.Any & {
  readonly update: Schema.Top & { readonly fields: Schema.Struct.Fields }
}

/** The keys the update variant fills itself: `Model.DateTimeUpdate*`, typed `Override`. */
type Renewed<M extends UpdatableModel> = {
  [K in keyof M['update']['fields']]: M['update']['fields'][K]['Type'] extends Brand.Brand<'Override'>
    ? K
    : never
}[keyof M['update']['fields']]

const hasConstructorDefault = (field: Schema.Constraint | undefined) =>
  Predicate.isNotUndefined(field?.ast.context?.constructorDefault)

/** The same keys at run time: a default the update variant has and the select variant lacks. */
const renewedKeys = <M extends UpdatableModel>(model: M) =>
  Object.keys(model.update.fields).filter(
    (key): key is Extract<Renewed<M>, string> =>
      hasConstructorDefault(model.update.fields[key]) && !hasConstructorDefault(model.fields[key]),
  )

/**
 * Makes a value through `variant`'s constructor, its defaults applied, and encodes its row. A
 * value the variant refuses dies as a `Schema.SchemaError`, whose message is the issue's text.
 */
const makeRowWith = <Variant extends Schema.Top>(variant: Variant) =>
  Effect.fnUntraced(
    function* (input: Variant['~type.make.in']) {
      const set = yield* variant.makeEffect(input)
      const row = yield* encodeWith(variant)(set)
      return { set, row }
    },
    Effect.mapError((issue) => new Schema.SchemaError(issue)),
    Effect.orDie,
  )

/**
 * How a service codes a model's rows: a read's row decodes into the model, a write's value is
 * made by a variant with its row. A row that does not decode, or a value a variant refuses, dies.
 */
export class RowCodec {
  /** Decodes the row of a read of one, none when the store found none. */
  static readonly decodeOne = <M extends Model.Any>(model: M) => decodeWith(Schema.Option(model))

  static readonly decodeMany = <M extends Model.Any>(model: M) => decodeWith(Schema.Array(model))

  /** Makes a new record through the insert variant, its id and times its defaults: `{ set, row }`. */
  static readonly makeInsert = <M extends Model.Any>(model: M) =>
    makeRowWith<M['insert']>(model.insert)

  /**
   * Makes an update through the update variant, from an input without the keys the variant
   * renews (`updatedAt`), so they move to now whether it holds fields or a record as read.
   */
  static readonly makeUpdate = <M extends UpdatableModel>(model: M) => {
    const make = makeRowWith<M['update']>(model.update)
    const renewed = renewedKeys(model)
    return (
      input: Omit<M['update']['~type.make.in'], Renewed<M>> & {
        readonly [K in Renewed<M>]?: unknown
      },
    ) => make(Struct.omit(input, renewed))
  }
}
