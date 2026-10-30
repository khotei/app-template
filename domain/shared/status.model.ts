import { Predicate, Schema } from 'effect'

/**
 * The one status vocabulary: `idle` waits for work, `queued` has work in flight, `preparing` and
 * `generating` run it, `done` and `failed` end it. An entity with a status picks its subset
 * (`ChatStatus`, `MessageStatus`).
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

export const isQueued = hasStatus(['queued'])

export const isPreparing = hasStatus(['preparing'])
