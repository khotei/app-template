import { Array as Arr, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { ChatService, MessageService } from '@app-template/application/chat'
import { SendMessageUseCase } from '@app-template/application/use-cases'
import { Api, CurrentUser } from '@app-template/http-api'

import { buildApiChat, buildApiMessage } from '#api/chat/chat.mapper'

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chatService = yield* ChatService
    const messageService = yield* MessageService
    const sendMessage = yield* SendMessageUseCase

    return handlers
      .handle(
        'create',
        Effect.fn('ChatHandler.create')(function* () {
          const user = yield* CurrentUser
          return buildApiChat(yield* chatService.create(user.id))
        }),
      )
      .handle(
        'list',
        Effect.fn('ChatHandler.list')(function* () {
          const user = yield* CurrentUser
          return Arr.map(yield* chatService.list(user.id), buildApiChat)
        }),
      )
      .handle(
        'get',
        Effect.fn('ChatHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          return buildApiChat(yield* chatService.getOne({ id: params.chatId, userId: user.id }))
        }),
      )
      .handle(
        'rename',
        Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          const chat = yield* chatService.rename(
            { id: params.chatId, userId: user.id },
            payload.title,
          )
          return buildApiChat(chat)
        }),
      )
      .handle(
        'delete',
        Effect.fn('ChatHandler.delete')(function* ({ params }) {
          const user = yield* CurrentUser
          yield* chatService.delete({ id: params.chatId, userId: user.id })
        }),
      )
      .handle(
        'send',
        Effect.fn('ChatHandler.send')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          const { userMessage, assistantMessage } = yield* sendMessage.send(
            user.id,
            params.chatId,
            payload,
          )
          return {
            userMessage: buildApiMessage(userMessage),
            assistantMessage: buildApiMessage(assistantMessage),
          }
        }),
      )
      .handle(
        'getMessage',
        Effect.fn('ChatHandler.getMessage')(function* ({ params }) {
          const user = yield* CurrentUser
          const message = yield* messageService.getOne({
            id: params.messageId,
            chatId: params.chatId,
            userId: user.id,
          })
          return buildApiMessage(message)
        }),
      )
  }),
)
