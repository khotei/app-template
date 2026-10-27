import { and, type SQL, sql } from 'drizzle-orm'
import { type PgTable, type PgUpdateSetSource, timestamp, uuid } from 'drizzle-orm/pg-core'
import { Array as Arr, Struct } from 'effect'

// Functions, not shared constants: each call returns a fresh builder, because a table names a
// builder's column the first time it sees it, so a constant reused under another key would keep
// the first name.

export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp({ withTimezone: true }).notNull()

export const updatedAt = () => timestamp({ withTimezone: true }).notNull()

type SetColumn<Table extends PgTable, K> = PgUpdateSetSource<Table>[K &
  keyof PgUpdateSetSource<Table>]

/** One mapper per field of `Set`, each answering what Drizzle's `set` takes for that column. */
export type SetColumns<Set, Table extends PgTable> = {
  readonly [K in keyof Required<Set>]: (value: Set[K]) => SetColumn<Table, K>
}

/** One mapper per field of `Where`, each answering a condition, or `undefined` for an absent field. */
export type WhereColumns<Where> = {
  readonly [K in keyof Required<Where>]: (value: Where[K]) => SQL | undefined
}

type SetRow<Set, Table extends PgTable> = { [K in keyof Required<Set>]?: SetColumn<Table, K> }

export const buildSet =
  <Set extends object, Table extends PgTable>(columns: SetColumns<Set, Table>) =>
  (set: Set) => {
    const row: SetRow<Set, Table> = {}
    for (const key of Struct.keys(columns)) row[key] = columns[key](set[key])
    return row
  }

export const buildWhere =
  <Where extends object>(columns: WhereColumns<Where>) =>
  (where: Where) =>
    and(...Arr.map(Struct.keys(columns), (key) => columns[key](where[key])))
