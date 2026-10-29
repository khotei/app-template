import { Array as Arr, Equal, type Predicate, pipe, Struct } from 'effect'

/**
 * Holds for a row whose every field `where` names still equals it, as a Pg repository's `Where`
 * reads; a field left `undefined` is no condition.
 */
export const matches =
  <Row extends object>(where: Partial<Row>): Predicate.Predicate<Row> =>
  (row) =>
    pipe(
      Struct.keys(where),
      Arr.every((key) => where[key] === undefined || Equal.equals(row[key], where[key])),
    )
