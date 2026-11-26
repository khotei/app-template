import { Array as Arr, identity, Match, Option, Struct } from 'effect'

/** A where's value for a column at or past `value`, in the column's own order. */
export class AtLeast<A> {
  constructor(readonly value: A) {}
}

type EncodedWhereValue<Value> =
  Value extends Option.Option<infer A>
    ? A | { isNull: true }
    : Value extends AtLeast<infer A>
      ? { gte: A }
      : Value extends ReadonlyArray<infer A>
        ? { in: Array<A> }
        : Value

interface EncodeWhereValue extends Struct.Lambda {
  <Value>(value: Value): EncodedWhereValue<Value>
  readonly '~lambda.out': EncodedWhereValue<this['~lambda.in']>
}

const encodeWhereValue = Struct.lambda<EncodeWhereValue>((value) =>
  Match.value(value).pipe(
    Match.when(
      Option.isOption,
      Option.getOrElse(() => ({ isNull: true })),
    ),
    Match.when(Match.instanceOf(AtLeast), ({ value }) => ({ gte: value })),
    Match.when(Arr.isArray, (values) => ({ in: Arr.copy(values) })),
    Match.orElse(identity),
  ),
)

/**
 * `where`, a service's model values, as the filter object a repository takes: an `Option` of none
 * is a column that is null, a list any of its values, an `AtLeast` a column at or past its value,
 * any other value itself.
 */
export const encodeWhere = <Where extends object>(where: Where) =>
  Struct.map(where, encodeWhereValue)
