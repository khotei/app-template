import { Status } from '#domain/shared/status.model'

// message.error.ts reads these, the transitions fail with its error: one file is an import cycle.
export const MessageStatus = Status.pick(['queued', 'preparing', 'generating', 'done', 'failed'])
export type MessageStatus = typeof MessageStatus.Type

export const ActiveMessageStatus = MessageStatus.pick(['queued', 'preparing', 'generating'])
export type ActiveMessageStatus = typeof ActiveMessageStatus.Type
