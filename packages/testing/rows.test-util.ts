import {
  Array as Arr,
  Effect,
  Equal,
  HashMap,
  Option,
  Predicate,
  pipe,
  Ref,
  Struct,
  UndefinedOr,
} from 'effect'
import { constTrue } from 'effect/Function'

/**
 * Holds for a row whose every field `where` names still equals it, as a Pg repository's `Where`
 * reads; a field left `undefined` is no condition.
 */
export const matches =
  <Row extends object>(where: Partial<Row>): Predicate.Predicate<Row> =>
  (row) =>
    pipe(
      Struct.keys(where),
      Arr.every((key) =>
        UndefinedOr.match(where[key], {
          onUndefined: constTrue,
          onDefined: Equal.equals(row[key]),
        }),
      ),
    )

/** Holds for a row whose every field `where` names is one of the listed values. */
export const matchesAny =
  <Row extends object>(
    where: {
      readonly [K in keyof Row]?: ReadonlyArray<Row[K]>
    },
  ): Predicate.Predicate<Row> =>
  (row) =>
    pipe(
      Struct.keys(where),
      Arr.every((key) =>
        UndefinedOr.match(where[key], {
          onUndefined: constTrue,
          onDefined: Arr.contains(row[key]),
        }),
      ),
    )

/** Replaces the row `id` finds while `where` holds by `update` of it; answers the rows written. */
export const updateRow = <Id, Row extends object>(
  rows: Ref.Ref<HashMap.HashMap<Id, Row>>,
  {
    id,
    where,
    update,
  }: { readonly id: Id; readonly where: Partial<Row>; readonly update: (row: Row) => Row },
): Effect.Effect<ReadonlyArray<Row>> =>
  Ref.modify(rows, (map) =>
    pipe(
      HashMap.get(map, id),
      Option.filter(matches(where)),
      Option.match({
        onNone: () => [Arr.empty<Row>(), map] as const,
        onSome: (row) => {
          const written = update(row)
          return [Arr.of(written), HashMap.set(map, id, written)] as const
        },
      }),
    ),
  )

/** Dies with `message` when a write answers no row, as the Pg repositories' writes do. */
export const orDieOnNoRows =
  (message: string) =>
  <A, E, R>(self: Effect.Effect<ReadonlyArray<A>, E, R>): Effect.Effect<void, E, R> =>
    self.pipe(
      Effect.filterOrElse(Arr.isReadonlyArrayNonEmpty, () => Effect.die(new Error(message))),
      Effect.asVoid,
    )

/**
 * Stores `row` by its id unless a stored row holds the id, as a primary key refuses it, or
 * `accepts` refuses the rows with it, as a unique index does; answers the rows written.
 */
export const insertRow = <Row extends { readonly id: string }>(
  rows: Ref.Ref<HashMap.HashMap<string, Row>>,
  {
    row,
    accepts = constTrue,
  }: { readonly row: Row; readonly accepts?: Predicate.Predicate<HashMap.HashMap<string, Row>> },
): Effect.Effect<ReadonlyArray<Row>> =>
  Ref.modify(rows, (map) => {
    const written = HashMap.set(map, row.id, row)
    if (HashMap.has(map, row.id) || !accepts(written)) {
      return [Arr.empty<Row>(), map] as const
    }
    return [Arr.of(row), written] as const
  })

/**
 * Replaces every row where `where` holds by `update` of it, unless `accepts` refuses the rows
 * with them, as a unique index does; answers the rows written.
 */
export const updateRows = <Id, Row>(
  rows: Ref.Ref<HashMap.HashMap<Id, Row>>,
  {
    where,
    update,
    accepts = constTrue,
  }: {
    readonly where: Predicate.Predicate<Row>
    readonly update: (row: Row) => Row
    readonly accepts?: Predicate.Predicate<HashMap.HashMap<Id, Row>>
  },
): Effect.Effect<ReadonlyArray<Row>> =>
  Ref.modify(rows, (map) => {
    const updated = pipe(map, HashMap.filter(where), HashMap.map(update))
    const written = HashMap.union(map, updated)
    if (!accepts(written)) {
      return [Arr.empty<Row>(), map] as const
    }
    return [HashMap.toValues(updated), written] as const
  })

/** Removes every row where `where` holds; answers the rows removed. */
export const deleteRows = <Id, Row>(
  rows: Ref.Ref<HashMap.HashMap<Id, Row>>,
  where: Predicate.Predicate<Row>,
): Effect.Effect<ReadonlyArray<Row>> =>
  Ref.modify(rows, (map) => {
    const removed = HashMap.filter(map, where)
    return [HashMap.toValues(removed), HashMap.removeMany(map, HashMap.keys(removed))] as const
  })

/**
 * The row with the fields of `set` that `columns` names, as `buildSet` writes them: `columns`
 * names every field of the set, a field outside it is dropped, an `undefined` one keeps the row's.
 */
export const writeSet = <Set extends object>(
  columns: { readonly [Key in keyof Required<Set>]: true },
  set: Set,
) => {
  const defined = pipe(
    Struct.keys(columns),
    Arr.filter((key) => Predicate.isNotUndefined(set[key])),
  )
  const written = Struct.pick(set, defined)
  return <Row extends Set>(row: Row): Row => ({ ...row, ...written })
}
