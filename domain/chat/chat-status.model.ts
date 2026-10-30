import { Status } from '#domain/shared/status.model'

// chat.error.ts reads it, the transitions fail with its error: one file is an import cycle.
/** `queued` while the chat's reply is in work, `failed` after its last reply failed, else `idle`. */
export const ChatStatus = Status.pick(['idle', 'queued', 'failed'])
export type ChatStatus = typeof ChatStatus.Type

/** The statuses a reply's end moves a chat to. */
export const SettledChatStatus = ChatStatus.pick(['idle', 'failed'])
export type SettledChatStatus = typeof SettledChatStatus.Type
