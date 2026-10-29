import { Schema, Struct } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  AttachmentBoundError,
  AttachmentId,
  AttachmentNotFoundError,
} from '@app-template/domain/attachment'
import {
  ChatBusyError,
  ChatId,
  Chat as ChatModel,
  ChatNotFoundError,
  ChatTitle,
  ChatWithStatus as ChatWithStatusModel,
  MessageFailure,
  MessageId,
  MessageInputInvalidError,
  Message as MessageModel,
  MessageNotFoundError,
} from '@app-template/domain/chat'

import { Attachment } from '#http-api/attachment/attachment.http'
import * as limits from '#http-api/shared/limits'
import { Auth } from '#http-api/shared/security'

export const Chat = ChatModel.mapFields((fields) => ({
  ...Struct.omit(fields, ['userId']),
  title: Schema.OptionFromNullOr(ChatTitle),
}))
export type Chat = typeof Chat.Type

export const ChatWithStatus = ChatWithStatusModel.mapFields((fields) => ({
  ...Struct.omit(fields, ['userId']),
  title: Schema.OptionFromNullOr(ChatTitle),
}))
export type ChatWithStatus = typeof ChatWithStatus.Type

/** Carries the failure's user-facing sentence, never its cause. */
export const Message = MessageModel.mapFields((fields) => ({
  ...fields,
  attachments: Schema.Array(Attachment),
  error: Schema.OptionFromNullOr(MessageFailure.mapFields(Struct.pick(['reason', 'message']))),
}))
export type Message = typeof Message.Type

const chatPath = { chatId: ChatId }

const chatNotFound = ChatNotFoundError.pipe(HttpApiSchema.status(404))

export class ChatHttp extends HttpApiGroup.make('chats')
  .add(
    HttpApiEndpoint.post('create', '/chats', { success: Chat.pipe(HttpApiSchema.status(201)) }),
    HttpApiEndpoint.get('list', '/chats', { success: Schema.Array(Chat) }),
    HttpApiEndpoint.get('get', '/chats/:chatId', {
      params: chatPath,
      success: ChatWithStatus,
      error: chatNotFound,
    }),
    HttpApiEndpoint.patch('rename', '/chats/:chatId', {
      params: chatPath,
      payload: Schema.Struct({ title: Schema.Trim.pipe(Schema.decodeTo(ChatTitle)) }),
      success: Chat,
      error: chatNotFound,
    }),
    HttpApiEndpoint.delete('delete', '/chats/:chatId', {
      params: chatPath,
      success: HttpApiSchema.NoContent,
      error: chatNotFound,
    }),
    HttpApiEndpoint.post('send', '/chats/:chatId/messages', {
      params: chatPath,
      payload: Schema.Struct({
        text: Schema.String.check(Schema.isMaxLength(limits.message.maxTextLength)),
        attachmentIds: Schema.Array(AttachmentId).check(
          Schema.isMaxLength(limits.attachment.maxFiles),
        ),
      }),
      success: Schema.Struct({ userMessage: Message, assistantMessage: Message }).pipe(
        HttpApiSchema.status(202),
      ),
      error: [
        MessageInputInvalidError.pipe(HttpApiSchema.status(400)),
        chatNotFound,
        ChatBusyError.pipe(HttpApiSchema.status(409)),
        AttachmentNotFoundError.pipe(HttpApiSchema.status(404)),
        AttachmentBoundError.pipe(HttpApiSchema.status(409)),
      ],
    }),
    HttpApiEndpoint.get('getMessage', '/chats/:chatId/messages/:messageId', {
      params: { ...chatPath, messageId: MessageId },
      success: Message,
      error: MessageNotFoundError.pipe(HttpApiSchema.status(404)),
    }),
  )
  .middleware(Auth) {}
