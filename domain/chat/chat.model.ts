import { Schema } from 'effect'

import { AttachmentId } from '#domain/attachment/attachment.id'
import { ChatId, MessageId } from '#domain/chat/chat.id'
import { UserId } from '#domain/user/user.id'

/** Counted in UTF-16 code units, as `Schema.isMaxLength` counts them. */
export const maxTitleLength = 120 as const

export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(maxTitleLength),
)
export type ChatTitle = typeof ChatTitle.Type

export class Chat extends Schema.Class<Chat>('Chat')({
  id: ChatId,
  userId: UserId,
  title: Schema.Option(ChatTitle),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

export const MessageAuthor = Schema.Literals(['user', 'assistant'])
export type MessageAuthor = typeof MessageAuthor.Type

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

export class MessageFailure extends Schema.Class<MessageFailure>('MessageFailure')({
  reason: Schema.Literal('ReplyFailed'),
  /** A user-facing sentence fixed per reason; it never quotes the cause. */
  message: Schema.String,
  /** Diagnostic detail for operators; it never leaves the api. */
  cause: Schema.String,
}) {}

export class Message extends Schema.Class<Message>('Message')({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  stage: MessageStage,
  text: Schema.String,
  attachmentIds: Schema.Array(AttachmentId),
  error: Schema.Option(MessageFailure),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}
