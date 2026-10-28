import { type DateTime, Option, Schema } from 'effect'

import { ChatId } from '#domain/chat/chat.id'
import type { ActiveMessage, MessageDetail } from '#domain/chat/message.model'
import { UserId } from '#domain/user/user.id'

/** Counted in UTF-16 code units, as `Schema.isMaxLength` counts them. */
export const maxTitleLength = 120 as const

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
}) {}

export interface ChatSummary {
  readonly chat: Chat
  readonly activeMessage: Option.Option<ActiveMessage>
}

export interface ChatDetail extends ChatSummary {
  /** Every message of the chat, in creation order. */
  readonly messages: ReadonlyArray<MessageDetail>
}

export const buildChat = (input: {
  readonly id: ChatId
  readonly userId: UserId
  readonly createdAt: DateTime.Utc
}): Chat =>
  new Chat({
    id: input.id,
    userId: input.userId,
    title: Option.none(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })
