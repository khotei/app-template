import {
  Array as Arr,
  Effect,
  Equal,
  HashMap,
  Option,
  type Predicate,
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
