import { Schema } from 'effect'

export const MessageStage = Schema.Literals([
  'queued',
  'preparing',
  'generating',
  'completed',
  'failed',
])
export type MessageStage = typeof MessageStage.Type

export const ActiveMessageStage = MessageStage.pick(['queued', 'preparing', 'generating'])
export type ActiveMessageStage = typeof ActiveMessageStage.Type
