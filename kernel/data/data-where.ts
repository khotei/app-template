import { Array as Arr, identity, Match, Option, Struct } from 'effect'

type EncodedWhereValue<Value> =
  Value extends Option.Option<infer A>
    ? A | { isNull: true }
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
    Match.when(Arr.isArray, (values) => ({ in: Arr.copy(values) })),
    Match.orElse(identity),
  ),
)

/**
 * `where`, a service's model values, as the filter object a repository takes: an `Option` of none
 * is a column that is null, a list any of its values, any other value itself.
 */
export const encodeWhere = <Where extends object>(where: Where) =>
  Struct.map(where, encodeWhereValue)
