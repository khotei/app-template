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

export type SetColumns<Fields, Table extends PgTable> = {
  readonly [K in keyof Required<Fields>]: (value: Fields[K]) => SetColumn<Table, K>
}

export type WhereColumns<Fields> = {
  readonly [K in keyof Required<Fields>]: (value: Fields[K]) => SQL | undefined
}

type SetRow<Fields, Table extends PgTable> = {
  [K in keyof Required<Fields>]?: SetColumn<Table, K>
}

/**
 * Builds the row Drizzle's `set` takes from the fields `columns` names: a field of `set` outside
 * `columns` is dropped, and an absent field answers `undefined`, which `set` skips.
 */
export const buildSet =
  <Fields extends object, Table extends PgTable>(columns: SetColumns<Fields, Table>) =>
  (set: Fields): SetRow<Fields, Table> =>
    Arr.reduce(Struct.keys(columns), {}, (row: SetRow<Fields, Table>, key) => ({
      ...row,
      [key]: columns[key](set[key]),
    }))

/**
 * Joins the conditions of the fields `columns` names with `and`: an absent field answers
 * `undefined`, which `and` skips, so a `Where` whose every field is absent yields no condition;
 * every `Where` keeps one required field.
 */
export const buildWhere =
  <Fields extends object>(columns: WhereColumns<Fields>) =>
  (where: Fields) =>
    and(...Arr.map(Struct.keys(columns), (key) => columns[key](where[key])))
