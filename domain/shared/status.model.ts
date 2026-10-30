import { Schema } from 'effect'

/**
 * The one status vocabulary: `idle` waits for work, `queued` has work in flight, `done` and
 * `failed` end it. An entity with a status picks its subset (`ChatStatus`).
 */
export const Status = Schema.Literals(['idle', 'queued', 'done', 'failed'])
export type Status = typeof Status.Type
