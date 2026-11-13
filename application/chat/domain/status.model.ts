import { Predicate, Schema } from 'effect'

/**
 * The one status vocabulary: `idle` waits for work, `queued` has work in flight, `preparing` and
 * `generating` run it, `done` and `failed` end it. A status picks its subset (`RunStatus`, and
 * `ChatStatus`, which a chat's newest Run gives it).
 */
export const Status = Schema.Literals([
  'idle',
  'queued',
  'preparing',
  'generating',
  'done',
  'failed',
])
export type Status = typeof Status.Type

/** Holds for an entity of any status subset whose status is one of `statuses`; build it once. */
export const hasStatus = <const L extends ReadonlyArray<Status>>(statuses: L) =>
  Predicate.Struct({ status: Schema.is(Status.pick(statuses)) })

export const isPreparing = hasStatus(['preparing'])
