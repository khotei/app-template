import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  ApiAttachment,
  AttachmentBoundError,
  AttachmentNotFoundError,
} from '#http-api/attachment/api-attachment.http'
import { AttachmentId, ChatId, MessageId, RunId, UserId } from '#http-api/shared/ids'
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

export const RunStatus = Schema.Literals(['queued', 'preparing', 'generating', 'done', 'failed'])
export type RunStatus = typeof RunStatus.Type

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

/** A message's own fields, as a Run carries its messages. */
export const ApiMessageFields = Schema.Struct({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  text: Schema.String,
  createdAt: Schema.DateTimeUtc,
})
export type ApiMessageFields = typeof ApiMessageFields.Type

export const RunFailureReason = Schema.Literals(['ReplyFailed', 'ReplyRefused'])
export type RunFailureReason = typeof RunFailureReason.Type

/** Carries the failure's user-facing sentence, never its cause. */
export const ApiRunFailure = Schema.Struct({
  reason: RunFailureReason,
  message: Schema.String,
})
export type ApiRunFailure = typeof ApiRunFailure.Type

/** A Run's own fields, as a message carries its Run. */
export const ApiRunFields = Schema.Struct({
  id: RunId,
  chatId: ChatId,
  status: RunStatus,
  failure: Schema.OptionFromNullOr(ApiRunFailure),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
})
export type ApiRunFields = typeof ApiRunFields.Type

/** A user's message with its newest Run, a reply with the Run that wrote it. */
export const ApiMessage = Schema.Struct({
  ...ApiMessageFields.fields,
  attachments: Schema.Array(ApiAttachment),
  run: Schema.OptionFromNullOr(ApiRunFields),
})
export type ApiMessage = typeof ApiMessage.Type

/** The work of answering `userMessage`; `assistantMessage` once it is done. Neither carries attachments. */
export const ApiRun = Schema.Struct({
  ...ApiRunFields.fields,
  userMessage: ApiMessageFields,
  assistantMessage: Schema.OptionFromNullOr(ApiMessageFields),
})
export type ApiRun = typeof ApiRun.Type

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

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()(
  'RunNotFoundError',
  { id: RunId },
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
    HttpApiEndpoint.get('listMessages', '/chats/:chatId/messages', {
      params: chatPath,
      success: Schema.Array(ApiMessage),
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
      success: ApiRun.pipe(HttpApiSchema.status(202)),
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
    HttpApiEndpoint.get('getRun', '/chats/:chatId/runs/:runId', {
      params: { ...chatPath, runId: RunId },
      success: ApiRun,
      error: RunNotFoundError,
    }),
  )
  .middleware(Auth) {}
