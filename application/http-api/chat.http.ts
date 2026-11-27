import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  ChatBusyError,
  ChatId,
  ChatNotFoundError,
  ChatTitle,
  Message,
  MessageId,
  MessageNotFoundError,
  RunId,
  RunNotFoundError,
  RunNotRetryableError,
} from '@app-template/application/chat/contract'

import { ApiChat, ApiMessage, ApiRun } from '#http-api/api-chat.model'

const chatPath = { chatId: ChatId }

export class ChatHttp extends HttpApiGroup.make('chats').add(
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
    error: ChatNotFoundError,
  }),
  HttpApiEndpoint.get('listMessages', '/chats/:chatId/messages', {
    params: chatPath,
    success: Schema.Array(ApiMessage),
    error: ChatNotFoundError,
  }),
  HttpApiEndpoint.post('ask', '/chats/:chatId/messages', {
    params: chatPath,
    payload: Schema.Struct({
      text: Message.fields.text.check(Schema.isMaxLength(20_000)),
    }),
    success: ApiMessage.pipe(HttpApiSchema.status(202)),
    error: [ChatNotFoundError, ChatBusyError],
  }),
  HttpApiEndpoint.post('retryRun', '/chats/:chatId/runs', {
    params: chatPath,
    success: ApiRun.pipe(HttpApiSchema.status(202)),
    error: [ChatNotFoundError, RunNotRetryableError],
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
) {}
