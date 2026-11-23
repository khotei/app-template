import { Array as Arr, Predicate, pipe, Record, String as Str, Struct } from 'effect'
import { Statement } from 'effect/sql'

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

/**
 * Renames the columns of rows to the fields an entity names, a `to_jsonb` row nested in them
 * included: the client transforms no names, so Drizzle's statements on it stay as they are.
 */
export const { array: buildFields } = Statement.defaultTransforms(Str.snakeToCamel)

/**
 * Takes the fields `columns` names, renamed to the columns that hold them: a field no column
 * holds is dropped and an `undefined` one skipped, as Drizzle's `values` and `set` do, since
 * `sql.insert` and `sql.update` would write every key and bind `undefined` as `NULL`.
 */
export const buildColumns = (columns: ReadonlyArray<string>) => (fields: Record<string, unknown>) =>
  pipe(
    Struct.pick(fields, columns),
    Record.filter(Predicate.isNotUndefined),
    Record.mapKeys(Str.camelToSnake),
  )
