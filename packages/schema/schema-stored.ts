import { DateTime, Schema } from 'effect'
import { Model, VariantSchema } from 'effect/schema'

/**
 * A stored record's schema in the three forms its row takes: `select` as a read returns it,
 * `insert` as a new row is written, `update` the fields a write may set.
 */
export const { Class, Field, FieldExcept, FieldOnly } = VariantSchema.make({
  variants: ['select', 'insert', 'update'],
  defaultVariant: 'select',
})

/** A timestamp its constructor stamps with the clock's now, where `makeEffect` gets none. */
const DateTimeNow = Schema.DateTimeUtcFromDate.pipe(Schema.withConstructorDefault(DateTime.now))

/** Stamped by the insert, never updated. */
export const CreatedAt = Field({ select: Schema.DateTimeUtcFromDate, insert: DateTimeNow })

/** Stamped by the insert and by every update. */
export const UpdatedAt = Field({
  select: Schema.DateTimeUtcFromDate,
  insert: DateTimeNow,
  update: DateTimeNow,
})

/**
 * A branded UUID id its insert generates as a UUIDv7, where `makeEffect` gets none; never updated.
 * The generator reads the clock and `globalThis.crypto`, not the context's `SecureRandom`.
 */
export const GeneratedId = <B extends string>(id: Schema.brand<Schema.String, B>) =>
  Field({ select: id, insert: Model.UuidV7WithGenerate(id) })

/** Written once, by the insert. */
export const insertOnly = FieldExcept(['update'])

/** Read with the record from another table, never written. */
export const readOnly = FieldOnly(['select'])
