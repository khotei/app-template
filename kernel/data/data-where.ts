import { Array as Arr, identity, Match, Option, Predicate, Struct, UndefinedOr } from 'effect'

/** The values from `from` to `to`, each included; a bound left out bounds nothing. */
export type WhereRange<A> = { readonly from?: A; readonly to?: A }

/** What a where may ask of a field of `A`: the value itself, any of a list, or a range. */
export type WhereValue<A> = A | ReadonlyArray<A> | WhereRange<A>

type EncodedWhereValue<Value> =
  Value extends Option.Option<infer A>
    ? A | { isNull: true }
    : Value extends ReadonlyArray<infer A>
      ? { in: Array<A> }
      : [keyof Value] extends ['from' | 'to']
        ? Value extends WhereRange<infer A>
          ? { gte?: A; lte?: A }
          : never
        : Value

interface EncodeWhereValue extends Struct.Lambda {
  <Value>(value: Value): EncodedWhereValue<Value>
  readonly '~lambda.out': EncodedWhereValue<this['~lambda.in']>
}

const isWhereRange = (value: unknown): value is WhereRange<unknown> =>
  Predicate.isObject(value) &&
  (Predicate.hasProperty(value, 'from') || Predicate.hasProperty(value, 'to'))

const encodeWhereValue = Struct.lambda<EncodeWhereValue>((value) =>
  Match.value(value).pipe(
    Match.when(
      Option.isOption,
      Option.getOrElse(() => ({ isNull: true })),
    ),
    Match.when(Arr.isArray, (values) => ({ in: Arr.copy(values) })),
    Match.when(isWhereRange, ({ from, to }) => ({
      ...UndefinedOr.map(from, (gte) => ({ gte })),
      ...UndefinedOr.map(to, (lte) => ({ lte })),
    })),
    Match.orElse(identity),
  ),
)

/** A service's `where`, model values alone, which its repository takes as Drizzle's filter object. */
export class Where {
  /**
   * `where` as the filter object a repository takes: an `Option` of none is a column that is
   * null, a list any of its values, a `WhereRange` the values between its bounds, any other value
   * itself.
   */
  static readonly encode = <TWhere extends object>(where: TWhere) =>
    Struct.map(where, encodeWhereValue)
}
