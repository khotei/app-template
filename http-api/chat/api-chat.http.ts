import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  AttachmentBoundError,
  AttachmentNotFoundError,
} from '#http-api/attachment/api-attachment.error'
import { ChatBusyError, ChatNotFoundError } from '#http-api/chat/api-chat.error'
import { ApiChat, ChatTitle } from '#http-api/chat/api-chat.model'
import { MessageInputInvalidError, MessageNotFoundError } from '#http-api/chat/api-message.error'
import { ApiMessage } from '#http-api/chat/api-message.model'
import { RunNotFoundError, RunNotRetryableError } from '#http-api/chat/api-run.error'
import { ApiRun } from '#http-api/chat/api-run.model'
import { AttachmentId, ChatId, MessageId, RunId } from '#http-api/shared/ids'
import * as limits from '#http-api/shared/limits'
import { Auth } from '#http-api/shared/security'

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
    HttpApiEndpoint.post('retryRun', '/chats/:chatId/messages/:messageId/runs', {
      params: { ...chatPath, messageId: MessageId },
      success: ApiRun.pipe(HttpApiSchema.status(202)),
      error: [MessageNotFoundError, ChatNotFoundError, ChatBusyError, RunNotRetryableError],
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
