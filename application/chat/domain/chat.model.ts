import { type DateTime, Effect, Option, Schema, type Types } from 'effect'

import { UserId } from '@app-template/application/identity'
import { maxTitleLength } from '@app-template/kernel/data'

import { Attachment } from '#chat/domain/attachment.model'
import { ChatBusyError } from '#chat/domain/chat.error'
import { ChatId } from '#chat/domain/chat.id'
import { Run, type RunStatus } from '#chat/domain/run.model'
import { Status } from '#chat/domain/status.model'

/** `queued` while the chat's reply is in work, `failed` after its last reply failed, else `idle`. */
export const ChatStatus = Status.pick(['idle', 'queued', 'failed'])
export type ChatStatus = typeof ChatStatus.Type

/** Its length is counted in UTF-16 code units, as `Schema.isMaxLength` counts them. */
export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(maxTitleLength),
).pipe(Schema.brand('ChatTitle'))
export type ChatTitle = typeof ChatTitle.Type

export class Chat extends Schema.Class<Chat>('Chat')({
  id: ChatId,
  userId: UserId,
  title: Schema.Option(ChatTitle),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  /** Bound to the chat's messages, in upload order; the chat's own writes never touch them. */
  attachments: Schema.Array(Attachment),
  /** The newest Run, read with the chat; none before its first send. */
  latestRun: Schema.Option(Run),
}) {}

/** What a chat's newest Run makes of it; a chat no send has reached yet is `idle`. */
const chatStatuses = {
  queued: 'queued',
  preparing: 'queued',
  generating: 'queued',
  done: 'idle',
  failed: 'failed',
} as const satisfies Record<RunStatus, ChatStatus>

export const buildChatStatus = (chat: Chat): ChatStatus =>
  Option.match(chat.latestRun, { onNone: () => 'idle', onSome: (run) => chatStatuses[run.status] })

/** A send takes a chat with no Run in work; one with a Run in work is `ChatBusyError`. */
export const ensureChatNotBusy = Effect.fn('ensureChatNotBusy')(function* (chat: Chat) {
  if (buildChatStatus(chat) === 'queued') {
    return yield* new ChatBusyError({ id: chat.id })
  }
})

export const renameChat = (
  chat: Chat,
  { title, at }: { readonly title: ChatTitle; readonly at: DateTime.Utc },
): Chat => new Chat({ ...chat, title: Option.some(title), updatedAt: at })

export const buildChat = (
  fields: Types.Simplify<Pick<Chat, 'id' | 'userId' | 'createdAt'>>,
): Chat =>
  new Chat({
    ...fields,
    title: Option.none(),
    updatedAt: fields.createdAt,
    attachments: [],
    latestRun: Option.none(),
  })
