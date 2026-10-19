import { Array as Arr, Effect, Option, Struct } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import {
  type ChatDetail,
  ChatService,
  type ChatSummary,
  DeleteChatUseCase,
  type MessageDetail,
  SendMessageUseCase,
} from '@app-template/application/chat'
import type { Attachment as AttachmentModel } from '@app-template/domain/attachment'
import type { Chat as ChatModel } from '@app-template/domain/chat'
import type * as Wire from '@app-template/http-api'
import { Api, CurrentUser } from '@app-template/http-api'

// Each projection names the fields that leave the api, so a model field reaches the wire only
// once its DTO declares it; relying on the encoder to drop `userId` or `cause` would not say so.
const toChat = (chat: ChatModel): Wire.Chat =>
  Struct.pick(chat, ['id', 'title', 'createdAt', 'updatedAt'])

const toSummary = ({ chat, activeMessage }: ChatSummary): Wire.ChatSummary => ({
  ...toChat(chat),
  activeMessage: Option.map(activeMessage, Struct.pick(['id', 'stage'])),
})

const toAttachment = (attachment: AttachmentModel): Wire.Attachment =>
  Struct.pick(attachment, ['id', 'messageId', 'fileName', 'mediaType', 'size', 'createdAt'])

const toMessage = ({ message, attachments }: MessageDetail): Wire.Message => ({
  ...Struct.pick(message, ['id', 'chatId', 'author', 'stage', 'text', 'createdAt', 'updatedAt']),
  attachments: Arr.map(attachments, toAttachment),
  error: Option.map(message.error, Struct.pick(['reason', 'message'])),
})

const toDetail = ({ messages, ...summary }: ChatDetail): Wire.ChatDetail => ({
  ...toSummary(summary),
  messages: Arr.map(messages, toMessage),
})

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chats = yield* ChatService
    const sendMessage = yield* SendMessageUseCase
    const deleteChat = yield* DeleteChatUseCase

    return handlers
      .handle(
        'create',
        Effect.fn('ChatHandler.create')(function* () {
          const user = yield* CurrentUser
          return toChat(yield* chats.create(user.id))
        }),
      )
      .handle(
        'list',
        Effect.fn('ChatHandler.list')(function* () {
          const user = yield* CurrentUser
          return Arr.map(yield* chats.list(user.id), toSummary)
        }),
      )
      .handle(
        'get',
        Effect.fn('ChatHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          return toDetail(yield* chats.get(user.id, params.chatId))
        }),
      )
      .handle(
        'rename',
        Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          return toChat(yield* chats.rename(user.id, params.chatId, payload.title))
        }),
      )
      .handle(
        'delete',
        Effect.fn('ChatHandler.delete')(function* ({ params }) {
          const user = yield* CurrentUser
          yield* deleteChat.delete(user.id, params.chatId)
        }),
      )
      .handle(
        'send',
        Effect.fn('ChatHandler.send')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          const sent = yield* sendMessage.send(user.id, params.chatId, payload)
          return {
            userMessage: toMessage(sent.userMessage),
            assistantMessage: toMessage(sent.assistantMessage),
          }
        }),
      )
      .handle(
        'getMessage',
        Effect.fn('ChatHandler.getMessage')(function* ({ params }) {
          const user = yield* CurrentUser
          return toMessage(yield* chats.getMessage(user.id, params.chatId, params.messageId))
        }),
      )
  }),
)
