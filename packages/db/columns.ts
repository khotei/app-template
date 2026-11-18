import {
  and,
  type Column,
  EmptyFilter,
  eq,
  type GetColumnData,
  isNull,
  type SQL,
  sql,
} from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'
import { Array as Arr, pipe, Struct } from 'effect'

// Functions, not shared constants: each call returns a fresh builder, because a table names a
// builder's column the first time it sees it, so a constant reused under another key would keep
// the first name.

export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp({ withTimezone: true }).notNull()

export const updatedAt = () => timestamp({ withTimezone: true }).notNull()

export type WhereColumns<Fields> = {
  readonly [K in keyof Required<Fields>]: (value: Fields[K]) => SQL | undefined
}

/**
 * Joins the conditions of the fields `columns` names with `and`: an absent field answers
 * `undefined`, which `and` skips, so a `Where` whose every field is absent yields no condition;
 * every `Where` keeps one required field.
 */
export const buildWhere =
  <Fields extends object>(columns: WhereColumns<Fields>) =>
  (where: Fields) =>
    pipe(
      Struct.keys(columns),
      Arr.map((key) => columns[key](where[key])),
      (conditions) => and(...conditions),
    )

/** Equals `value`, or `IS NULL` for `null`, which SQL's `=` never matches. */
export const eqOrIsNull =
  <TColumn extends Column>(column: TColumn) =>
  (value: GetColumnData<TColumn, 'raw'> | null): SQL =>
    value === null ? isNull(column) : eq(column, value)

/**
 * A `Where` field left out is no condition of a relational filter, which takes `EmptyFilter`
 * for that and refuses `undefined`.
 */
export const skipUndefined = <A>(value: A | undefined): A | EmptyFilter => value ?? EmptyFilter
