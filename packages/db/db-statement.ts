import { Array as Arr, pipe, String as Str, Struct } from 'effect'
import { Statement } from 'effect/sql'

/**
 * The `PgClient` options that map camelCase fields to snake_case columns, in the names a
 * statement writes and the rows it returns, a `to_jsonb` row nested in them included.
 *
 * Drizzle's statements on the same client stay as they are: it sends its SQL as text through
 * `unsafe` and reads its rows `withoutTransform`, as `values` or `raw`.
 */
export const snakeCaseNames = {
  transformQueryNames: Str.camelToSnake,
  transformResultNames: Str.snakeToCamel,
} as const

export type WhereFragments<Fields> = {
  readonly [K in keyof Required<Fields>]: (value: Fields[K]) => Statement.Fragment | undefined
}

/**
 * Joins the fragments of the fields `fragments` names with `AND`: an absent field returns
 * `undefined`, which the join skips; every `Where` keeps one required field.
 */
export const buildWhereFragment =
  <Fields extends object>(fragments: WhereFragments<Fields>) =>
  (where: Fields) =>
    pipe(
      Struct.keys(fragments),
      Arr.flatMapNullishOr((key) => fragments[key](where[key])),
      Statement.and,
    )
