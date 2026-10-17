import { Schema } from 'effect'

export const outboxTable = 'outbox' as const

export const OutboxMessage = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  payload: Schema.Unknown,
  createdAt: Schema.DateTimeUtc,
})
export type OutboxMessage = typeof OutboxMessage.Type
