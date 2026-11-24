import {
  and,
  type Column,
  EmptyFilter,
  eq,
  getColumns,
  type InferSelectModel,
  inArray,
  isNull,
  type SQL,
  sql,
  type Table,
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
 * What each field of `Row` is compared with: a value its column equals, `null` for a column that
 * is null, an array for the values it is among; a field left out is no condition.
 */
export type Conditions<Row> = {
  readonly [K in keyof Row]?: Row[K] | ReadonlyArray<NonNullable<Row[K]>>
}

/**
 * The conditions that find rows of `Row` by `Key`, named by its one value: a write takes one key,
 * and a read that finds by either of several takes them all, one of which the where must name.
 */
export type Where<Row, Key extends keyof Row> = Key extends unknown
  ? Types.Simplify<Pick<Row, Key> & Omit<Conditions<Row>, Key>>
  : never

const matchesNone = sql`false`

/** `IS NULL` for `null`, which SQL's `=` never matches, `IN` for an array, else `=`. */
const encodeCondition = (column: Column, value: unknown): SQL =>
  value === null ? isNull(column) : Arr.isArray(value) ? inArray(column, value) : eq(column, value)

/**
 * The condition of `where` on `table`, the one a query names, joined with `more` by `and`. It
 * always returns one, so no statement goes without its `WHERE`: a `where` with no field, or with
 * a field that is no column of `table`, matches no row.
 */
export const encodeWhere: <TTable extends Table>(
  table: TTable,
) => (where: Conditions<InferSelectModel<TTable>>, ...more: ReadonlyArray<SQL | undefined>) => SQL =
  (table: Table) =>
  (where: Readonly<Record<string, unknown>>, ...more: ReadonlyArray<SQL | undefined>) => {
    const columns: Readonly<Record<string, Column | undefined>> = getColumns(table)
    return pipe(
      where,
      Record.filter(Predicate.isNotUndefined),
      Record.collect((key, value) =>
        UndefinedOr.match(columns[key], {
          onUndefined: () => matchesNone,
          onDefined: (column) => encodeCondition(column, value),
        }),
      ),
      (conditions) => and(...conditions, ...more) ?? matchesNone,
    )
  }

/**
 * A `Where` field left out is no condition of a relational filter, which takes `EmptyFilter`
 * for that and refuses `undefined`.
 */
export const skipUndefined = <A>(value: A | undefined): A | EmptyFilter => value ?? EmptyFilter
