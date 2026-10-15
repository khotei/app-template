export const outboxTable = 'outbox' as const

export interface OutboxMessage {
  readonly id: string
  readonly type: string
  readonly payload: unknown
  readonly createdAt: Date
}
