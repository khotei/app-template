import {
  type AnyTableFilter,
  relationsFilterToSQL,
  SQL,
  sql,
  type Table,
  type TableFilter,
} from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'
import { Array as Arr, Predicate, pipe, Record, type Types, UndefinedOr } from 'effect'

// Functions, not shared constants: each call returns a fresh builder, because a table names a
// builder's column the first time it sees it, so a constant reused under another key would keep
// the first name.

export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp({ withTimezone: true }).notNull()

export const updatedAt = () => timestamp({ withTimezone: true }).notNull()

/**
 * `Filter`, the object a query takes as its `where`, with `Key` named by its one value: a write
 * takes one key, and a read that finds by either of several takes them all, one of which the
 * where must name.
 */
export type Keyed<Filter, Row, Key extends keyof Row & keyof Filter> = Key extends unknown
  ? Types.Simplify<Pick<Row, Key> & Omit<Filter, Key>>
  : never

const matchesNone = { RAW: sql`false` } as const

// A filter's own objects (itself, an operator's, a relation's), never a value such as a `Date`.
const isFilterObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Predicate.isObject(value) && Object.getPrototypeOf(value) === Object.prototype

const dropUndefined = (value: unknown): unknown => {
  if (Arr.isArray(value)) {
    return Arr.map(value, dropUndefined)
  }
  if (!isFilterObject(value)) {
    return value
  }
  return pipe(value, Record.filter(Predicate.isNotUndefined), Record.map(dropUndefined))
}

/**
 * `filter` as a relational query takes its `where`. A field left `undefined` is no condition,
 * which Drizzle would throw on; a filter with no condition matches no row, so no statement goes
 * without its `WHERE`.
 */
export const buildFilter = <Filter extends object>(filter: Filter): Filter | typeof matchesNone => {
  const conditions = dropUndefined(filter)
  // The same fields less the `undefined` ones, which the type already reads as left out.
  return Record.isEmptyRecord(conditions as Record<string, unknown>)
    ? matchesNone
    : (conditions as Filter)
}

/**
 * The condition of `filter`, the object a relational query takes as its `where`, for a statement
 * of the core builder: `buildFilter`'s, so a write always has its `WHERE`.
 */
export const encodeFilter = <TTable extends Table>(
  table: TTable,
  filter: TableFilter<TTable>,
): SQL =>
  // Drizzle's own queries hand it a table's filter the same way: its type for any table's filter
  // takes no plain value, so no filter of a table is assignable to it.
  UndefinedOr.match(relationsFilterToSQL(table, buildFilter(filter) as AnyTableFilter).sql, {
    onUndefined: () => sql`false`,
    onDefined: (chunks) => new SQL(chunks),
  })
