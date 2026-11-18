import { flow, Schema, Struct } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  AttachmentBoundError,
  AttachmentId,
  AttachmentNotFoundError,
  Chat,
  ChatBusyError,
  ChatId,
  ChatNotFoundError,
  ChatStatus,
  ChatTitle,
  Message,
  MessageFields,
  MessageId,
  MessageInputInvalidError,
  MessageNotFoundError,
  Run,
  RunId,
  RunNotFoundError,
  RunNotQueuedError,
  RunNotRetryableError,
} from '@app-template/application/chat'

import { maxFiles } from '#api/attachment/attachment.http'

/** A chat with the status its newest Run gives it, in place of that Run. */
export const ApiChat = Chat.mapFields(
  flow(Struct.omit(['run']), Struct.assign({ status: ChatStatus })),
).annotate({ identifier: 'ApiChat' })
export type ApiChat = typeof ApiChat.Type

const chatPath = { chatId: ChatId }

export class ChatHttp extends HttpApiGroup.make('chats').add(
  HttpApiEndpoint.post('create', '/chats', { success: ApiChat.pipe(HttpApiSchema.status(201)) }),
  HttpApiEndpoint.get('list', '/chats', { success: Schema.Array(ApiChat) }),
  HttpApiEndpoint.get('get', '/chats/:chatId', {
    params: chatPath,
    success: ApiChat,
    error: ChatNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.patch('rename', '/chats/:chatId', {
    params: chatPath,
    payload: Schema.Struct({ title: Schema.Trim.pipe(Schema.decodeTo(ChatTitle)) }),
    success: ApiChat,
    error: ChatNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.delete('delete', '/chats/:chatId', {
    params: chatPath,
    error: ChatNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.get('listMessages', '/chats/:chatId/messages', {
    params: chatPath,
    success: Schema.Array(Message),
    error: ChatNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.post('createMessage', '/chats/:chatId/messages', {
    params: chatPath,
    payload: Schema.Struct({
      text: MessageFields.fields.text.check(Schema.isMaxLength(20_000)),
      attachmentIds: Schema.Array(AttachmentId).check(Schema.isMaxLength(maxFiles)),
    }),
    success: Run.pipe(HttpApiSchema.status(202)),
    error: [
      MessageInputInvalidError.pipe(HttpApiSchema.status(400)),
      ChatNotFoundError.pipe(HttpApiSchema.status(404)),
      ChatBusyError.pipe(HttpApiSchema.status(409)),
      AttachmentNotFoundError.pipe(HttpApiSchema.status(404)),
      AttachmentBoundError.pipe(HttpApiSchema.status(409)),
      RunNotQueuedError.pipe(HttpApiSchema.status(503)),
    ],
  }),
  HttpApiEndpoint.post('retryRun', '/chats/:chatId/messages/:userMessageId/runs', {
    params: { ...chatPath, userMessageId: MessageId },
    success: Run.pipe(HttpApiSchema.status(202)),
    error: [
      MessageNotFoundError.pipe(HttpApiSchema.status(404)),
      ChatNotFoundError.pipe(HttpApiSchema.status(404)),
      ChatBusyError.pipe(HttpApiSchema.status(409)),
      RunNotRetryableError.pipe(HttpApiSchema.status(409)),
      RunNotQueuedError.pipe(HttpApiSchema.status(503)),
    ],
  }),
  HttpApiEndpoint.get('getMessage', '/chats/:chatId/messages/:messageId', {
    params: { ...chatPath, messageId: MessageId },
    success: Message,
    error: MessageNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.get('getRun', '/chats/:chatId/runs/:runId', {
    params: { ...chatPath, runId: RunId },
    success: Run,
    error: RunNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
) {}
