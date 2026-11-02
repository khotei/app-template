import { type DateTime, Effect, Option, Predicate, Schema, type Types } from 'effect'

import { UserId } from '@app-template/application/identity'

import { Attachment } from '#chat/domain/attachment.model'
import { ChatBusyError, ChatStatusInvalidError } from '#chat/domain/chat.error'
import { ChatId } from '#chat/domain/chat.id'
import { isQueued, Status } from '#chat/domain/status.model'

/** `queued` while the chat's reply is in work, `failed` after its last reply failed, else `idle`. */
export const ChatStatus = Status.pick(['idle', 'queued', 'failed'])
export type ChatStatus = typeof ChatStatus.Type

/** Counted in UTF-16 code units, as `Schema.isMaxLength` counts them. */
export const maxTitleLength = 120

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
  status: ChatStatus,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  /** Bound to the chat's messages, in upload order; the chat's own writes never touch them. */
  attachments: Schema.Array(Attachment),
}) {}

/** Which chats may enter each status: a send takes a chat with no reply in work, its end one. */
const transitions = {
  queued: Predicate.not(isQueued),
  idle: isQueued,
  failed: isQueued,
} as const satisfies Record<ChatStatus, Predicate.Predicate<Chat>>

const move = Effect.fnUntraced(function* (chat: Chat, to: ChatStatus) {
  if (!transitions[to](chat)) {
    return yield* new ChatStatusInvalidError({ id: chat.id, from: chat.status, to })
  }
  return new Chat({ ...chat, status: to })
})

/** Takes the chat for a send's reply; a chat whose reply is still in work is `ChatBusyError`. */
export const queueChat = Effect.fn('queueChat')((chat: Chat) =>
  move(chat, 'queued').pipe(
    Effect.catchTag('ChatStatusInvalidError', () => new ChatBusyError({ id: chat.id })),
  ),
)

export const idleChat = Effect.fn('idleChat')((chat: Chat) => move(chat, 'idle'))

export const failChat = Effect.fn('failChat')((chat: Chat) => move(chat, 'failed'))

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
    status: 'idle',
    updatedAt: fields.createdAt,
    attachments: [],
  })
