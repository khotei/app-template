import { type DateTime, Effect, Option, Schema, type Types } from 'effect'

import { UserId } from '@app-template/application/identity'
import { maxTitleLength } from '@app-template/kernel/data'

import { Attachment } from '#chat/domain/attachment.model'
import { ChatBusyError } from '#chat/domain/chat.error'
import { ChatId } from '#chat/domain/chat.id'
import { RunFields, type RunStatus } from '#chat/domain/run-fields.model'
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

/** A chat's own fields: what a Run nests of it. */
export const ChatFields = Schema.Struct({
  id: ChatId,
  userId: UserId,
  title: Schema.Option(ChatTitle).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
})
export type ChatFields = typeof ChatFields.Type

export class Chat extends Schema.Class<Chat>('Chat')({
  ...ChatFields.fields,
  /** Bound to the chat's messages, in upload order; the chat's own writes never touch them. */
  attachments: Schema.Array(Attachment),
  /** The newest Run, flat, read with the chat and never written; none before its first send. */
  run: Schema.Option(RunFields).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
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
  Option.match(chat.run, { onNone: () => 'idle', onSome: (run) => chatStatuses[run.status] })

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
): Chat => new Chat({ ...fields, updatedAt: fields.createdAt, attachments: [] })
