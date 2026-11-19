import { Array as Arr, Effect, flow, pipe, Struct } from 'effect'

import { buildIdSchema } from '#chat/domain/chat.util'

export const AttachmentId = buildIdSchema('AttachmentId')
export type AttachmentId = typeof AttachmentId.Type

/** `found` when it holds a value of each id of `ids`; else `onMissing` of the ids it lacks, in the order asked. */
export const ensureAllFound =
  <Id, E>(ids: ReadonlyArray<Id>, onMissing: (missing: Arr.NonEmptyReadonlyArray<Id>) => E) =>
  <A extends { readonly id: Id }>(found: ReadonlyArray<A>): Effect.Effect<ReadonlyArray<A>, E> =>
    pipe(
      ids,
      Arr.difference(Arr.map(found, Struct.get('id'))),
      Arr.match({ onEmpty: () => Effect.succeed(found), onNonEmpty: flow(onMissing, Effect.fail) }),
    )
