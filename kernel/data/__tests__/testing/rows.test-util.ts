import {
  Array as Arr,
  type Effect,
  Equal,
  HashMap,
  Order,
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

interface Created {
  readonly id: string
  readonly createdAt: Date
}

/** Creation order, a tie broken by id, as the repositories order their reads. */
const inCreationOrder = Order.combine(
  Order.mapInput(Order.Date, (row: Created) => row.createdAt),
  Order.mapInput(Order.String, (row: Created) => row.id),
)

/** The rows where `where` holds, in creation order. */
export const inCreationOrderWhere = <Row extends Created>(
  rows: HashMap.HashMap<string, Row>,
  where: Predicate.Predicate<Row>,
) => pipe(rows, HashMap.filter(where), HashMap.toValues, Arr.sort(inCreationOrder))
