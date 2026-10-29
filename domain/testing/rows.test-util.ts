import { Array as Arr, Equal, type Predicate, Struct } from 'effect'

/**
 * Holds for a row whose every field `where` names still equals it, as a Pg repository's `Where`
 * reads; a field left `undefined` is no condition.
 */
export const matches =
  <Row extends object>(where: Partial<Row>): Predicate.Predicate<Row> =>
  (row) =>
    Arr.every(
      Struct.keys(where),
      (key) => where[key] === undefined || Equal.equals(row[key], where[key]),
    )
