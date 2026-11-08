import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  ApiAttachment,
  AttachmentBoundError,
  AttachmentNotFoundError,
} from '#http-api/attachment/attachment.http'
import { AttachmentId, ChatId, MessageId, UserId } from '#http-api/shared/ids'
import * as limits from '#http-api/shared/limits'
import { Auth } from '#http-api/shared/security'

export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(limits.chat.maxTitleLength),
).pipe(Schema.brand('ChatTitle'))
export type ChatTitle = typeof ChatTitle.Type

export const ChatStatus = Schema.Literals(['idle', 'queued', 'failed'])
export type ChatStatus = typeof ChatStatus.Type

export const MessageStatus = Schema.Literals([
  'queued',
  'preparing',
  'generating',
  'done',
  'failed',
])
export type MessageStatus = typeof MessageStatus.Type

export const MessageAuthor = Schema.Literals(['user', 'assistant'])
export type MessageAuthor = typeof MessageAuthor.Type

export const ApiChat = Schema.Struct({
  id: ChatId,
  userId: UserId,
  title: Schema.OptionFromNullOr(ChatTitle),
  status: ChatStatus,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  attachments: Schema.Array(ApiAttachment),
})
export type ApiChat = typeof ApiChat.Type

export const MessageFailureReason = Schema.Literals(['ReplyFailed', 'ReplyRefused'])
export type MessageFailureReason = typeof MessageFailureReason.Type

/** Carries the failure's user-facing sentence, never its cause. */
export const ApiMessageFailure = Schema.Struct({
  reason: MessageFailureReason,
  message: Schema.String,
})
export type ApiMessageFailure = typeof ApiMessageFailure.Type

export const ApiMessage = Schema.Struct({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  status: MessageStatus,
  text: Schema.String,
  error: Schema.OptionFromNullOr(ApiMessageFailure),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  attachments: Schema.Array(ApiAttachment),
})
export type ApiMessage = typeof ApiMessage.Type

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  'ChatNotFoundError',
  { id: ChatId },
  { httpApiStatus: 404 },
) {}

export class ChatBusyError extends Schema.TaggedError<ChatBusyError>()(
  'ChatBusyError',
  { id: ChatId },
  { httpApiStatus: 409 },
) {}

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId },
  { httpApiStatus: 404 },
) {}

export class MessageInputInvalidError extends Schema.TaggedError<MessageInputInvalidError>()(
  'MessageInputInvalidError',
  {},
  { httpApiStatus: 400 },
) {}

const chatPath = { chatId: ChatId }

export class ChatHttp extends HttpApiGroup.make('chats')
  .add(
    HttpApiEndpoint.post('create', '/chats', { success: ApiChat.pipe(HttpApiSchema.status(201)) }),
    HttpApiEndpoint.get('list', '/chats', { success: Schema.Array(ApiChat) }),
    HttpApiEndpoint.get('get', '/chats/:chatId', {
      params: chatPath,
      success: ApiChat,
      error: ChatNotFoundError,
    }),
    HttpApiEndpoint.patch('rename', '/chats/:chatId', {
      params: chatPath,
      payload: Schema.Struct({ title: Schema.Trim.pipe(Schema.decodeTo(ChatTitle)) }),
      success: ApiChat,
      error: ChatNotFoundError,
    }),
    HttpApiEndpoint.delete('delete', '/chats/:chatId', {
      params: chatPath,
      success: HttpApiSchema.NoContent,
      error: ChatNotFoundError,
    }),
    HttpApiEndpoint.post('createMessage', '/chats/:chatId/messages', {
      params: chatPath,
      payload: Schema.Struct({
        text: Schema.String.check(Schema.isMaxLength(limits.message.maxTextLength)),
        attachmentIds: Schema.Array(AttachmentId).check(
          Schema.isMaxLength(limits.attachment.maxFiles),
        ),
      }),
      success: Schema.Struct({ userMessage: ApiMessage, assistantMessage: ApiMessage }).pipe(
        HttpApiSchema.status(202),
      ),
      error: [
        MessageInputInvalidError,
        ChatNotFoundError,
        ChatBusyError,
        AttachmentNotFoundError,
        AttachmentBoundError,
      ],
    }),
    HttpApiEndpoint.get('getMessage', '/chats/:chatId/messages/:messageId', {
      params: { ...chatPath, messageId: MessageId },
      success: ApiMessage,
      error: MessageNotFoundError,
    }),
  )
  .middleware(Auth) {}
