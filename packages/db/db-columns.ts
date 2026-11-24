import {
  type AnyTableFilter,
  relationsFilterToSQL,
  SQL,
  sql,
  type Table,
  type TableFilter,
} from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'
import { Record, type Types, UndefinedOr } from 'effect'

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

/**
 * `filter` as a relational query takes its `where`: one that names no field matches no row, so
 * no statement goes without its `WHERE`.
 */
export const buildFilter = <Filter extends Readonly<Record<string, unknown>>>(
  filter: Filter,
): Filter | typeof matchesNone => (Record.isEmptyReadonlyRecord(filter) ? matchesNone : filter)

/**
 * The condition of `filter`, the object a relational query takes as its `where`, for a statement
 * of the core builder. It always returns one, so no write goes without its `WHERE`: a filter
 * with no condition matches no row.
 */
export const encodeFilter = <TTable extends Table>(
  table: TTable,
  filter: TableFilter<TTable>,
): SQL =>
  // Drizzle's own queries hand it a table's filter the same way: its type for any table's filter
  // takes no plain value, so no filter of a table is assignable to it.
  UndefinedOr.match(relationsFilterToSQL(table, filter as AnyTableFilter).sql, {
    onUndefined: () => sql`false`,
    onDefined: (chunks) => new SQL(chunks),
  })
