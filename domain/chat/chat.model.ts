import { Schema } from 'effect'

import { AttachmentId } from '#domain/attachment/attachment.model'
import { UserId } from '#domain/user/user.model'

export const ChatId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ChatId'))
export type ChatId = typeof ChatId.Type

export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMinLength(1),
  Schema.isMaxLength(120),
)
export type ChatTitle = typeof ChatTitle.Type

export class Chat extends Schema.Class<Chat>('Chat')({
  id: ChatId,
  userId: UserId,
  title: Schema.Option(ChatTitle),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

export const MessageId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('MessageId'))
export type MessageId = typeof MessageId.Type

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
