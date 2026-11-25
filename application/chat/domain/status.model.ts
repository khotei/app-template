import { Schema } from 'effect'

/** The statuses a chat picks its own from (`ChatStatus`, which a chat's newest Run gives it). */
export const Status = Schema.Literals(['idle', 'queued', 'generating', 'done', 'failed'])
export type Status = typeof Status.Type
