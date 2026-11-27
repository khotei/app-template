import {
  type AnyTableFilter,
  relationsFilterToSQL,
  SQL,
  sql,
  type Table,
  type TableFilter,
} from 'drizzle-orm'
import { type Types, UndefinedOr } from 'effect'

/**
 * `Filter`, the object a query takes as its `where`, with `Key` named by its one value: a write
 * takes one key, and a read that finds by either of several takes them all, one of which the
 * where must name.
 */
export type Keyed<Filter, Row, Key extends keyof Row & keyof Filter> = Key extends unknown
  ? Types.Simplify<Pick<Row, Key> & Omit<Filter, Key>>
  : never

export class DbFilter {
  /**
   * The condition of `filter`, the object a relational query takes as its `where` bare, for a
   * statement of the core builder (`update`, `delete`, a plain `select`). It always returns one,
   * so no such statement goes without its `WHERE`: a filter with no condition matches no row.
   */
  static readonly encode = <TTable extends Table>(
    table: TTable,
    filter: TableFilter<TTable>,
  ): SQL =>
    // Drizzle's own queries hand it a table's filter the same way: its type for any table's filter
    // takes no plain value, so no filter of a table is assignable to it.
    UndefinedOr.match(relationsFilterToSQL(table, filter as AnyTableFilter).sql, {
      onUndefined: () => sql`false`,
      onDefined: (chunks) => new SQL(chunks),
    })
}
