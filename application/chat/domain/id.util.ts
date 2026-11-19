import { Array as Arr, Effect, flow, pipe, Schema, Struct } from 'effect'

export const buildIdSchema = <const B extends string>(
  brand: Parameters<typeof Schema.brand<B>>[0],
) => Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))

/** `found` when it holds a value of each id of `ids`; else `onMissing` of the ids it lacks, in the order asked. */
export const ensureAllFound =
  <Id, E>(ids: ReadonlyArray<Id>, onMissing: (missing: Arr.NonEmptyReadonlyArray<Id>) => E) =>
  <A extends { readonly id: Id }>(found: ReadonlyArray<A>): Effect.Effect<ReadonlyArray<A>, E> =>
    pipe(
      ids,
      Arr.difference(Arr.map(found, Struct.get('id'))),
      Arr.match({ onEmpty: () => Effect.succeed(found), onNonEmpty: flow(onMissing, Effect.fail) }),
    )
