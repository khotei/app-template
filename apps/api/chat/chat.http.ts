import { flow, Schema, Struct } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
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
  RunFailure,
  RunFields,
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

// A failure's cause is the provider's or SQS's text, which can hold request ids, key hints or
// the prompt: it stays in the row and the error, and every wire shape of either omits it.
const failure = Schema.OptionFromNullOr(
  RunFailure.mapFields(Struct.omit(['cause'])).annotate({ identifier: 'ApiRunFailure' }),
)

const ApiRun = Run.mapFields(Struct.assign({ failure })).annotate({ identifier: 'ApiRun' })

const ApiRunFields = RunFields.mapFields(Struct.assign({ failure })).annotate({
  identifier: 'ApiRunFields',
})

const ApiMessage = Message.mapFields(
  Struct.assign({ run: Schema.OptionFromNullOr(ApiRunFields) }),
).annotate({ identifier: 'ApiMessage' })

const ApiRunNotQueuedError = RunNotQueuedError.mapFields(Struct.omit(['cause'])).annotate({
  identifier: 'ApiRunNotQueuedError',
})

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
    success: Schema.Array(ApiMessage),
    error: ChatNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.post('createMessage', '/chats/:chatId/messages', {
    params: chatPath,
    payload: Schema.Struct({
      text: MessageFields.fields.text.check(Schema.isMaxLength(20_000)),
      attachmentIds: Schema.Array(AttachmentId).check(Schema.isMaxLength(maxFiles)),
    }),
    success: ApiRun.pipe(HttpApiSchema.status(202)),
    error: [
      MessageInputInvalidError.pipe(HttpApiSchema.status(400)),
      ChatNotFoundError.pipe(HttpApiSchema.status(404)),
      ChatBusyError.pipe(HttpApiSchema.status(409)),
      AttachmentNotFoundError.pipe(HttpApiSchema.status(404)),
      ApiRunNotQueuedError.pipe(HttpApiSchema.status(503)),
    ],
  }),
  HttpApiEndpoint.post('retryRun', '/chats/:chatId/runs', {
    params: chatPath,
    success: ApiRun.pipe(HttpApiSchema.status(202)),
    error: [
      MessageNotFoundError.pipe(HttpApiSchema.status(404)),
      ChatNotFoundError.pipe(HttpApiSchema.status(404)),
      ChatBusyError.pipe(HttpApiSchema.status(409)),
      RunNotRetryableError.pipe(HttpApiSchema.status(409)),
      ApiRunNotQueuedError.pipe(HttpApiSchema.status(503)),
    ],
  }),
  HttpApiEndpoint.get('getMessage', '/chats/:chatId/messages/:messageId', {
    params: { ...chatPath, messageId: MessageId },
    success: ApiMessage,
    error: MessageNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.get('getRun', '/chats/:chatId/runs/:runId', {
    params: { ...chatPath, runId: RunId },
    success: ApiRun,
    error: RunNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
) {}
