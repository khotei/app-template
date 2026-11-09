import { Array as Arr, Effect, Struct } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { ChatService, MessageService } from '@app-template/application/chat'
import { CreateUserMessageUseCase } from '@app-template/application/use-cases'
import { Api, CurrentUser } from '@app-template/http-api'

import { buildApiChat, buildApiMessage } from '#api/chat/chat.mapper'

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chatService = yield* ChatService
    const messageService = yield* MessageService
    const createUserMessage = yield* CreateUserMessageUseCase

    return handlers
      .handle(
        'create',
        Effect.fn('ChatHandler.create')(function* () {
          const user = yield* CurrentUser
          return yield* chatService.create(user.id)
        }, Effect.map(buildApiChat)),
      )
      .handle(
        'list',
        Effect.fn('ChatHandler.list')(
          function* () {
            const user = yield* CurrentUser
            return yield* chatService.list(user.id)
          },
          Effect.map(Arr.map(buildApiChat)),
        ),
      )
      .handle(
        'get',
        Effect.fn('ChatHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          return yield* chatService.getOne({ id: params.chatId, userId: user.id })
        }, Effect.map(buildApiChat)),
      )
      .handle(
        'rename',
        Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          return yield* chatService.rename({ id: params.chatId, userId: user.id }, payload.title)
        }, Effect.map(buildApiChat)),
      )
      .handle(
        'delete',
        Effect.fn('ChatHandler.delete')(function* ({ params }) {
          const user = yield* CurrentUser
          yield* chatService.delete({ id: params.chatId, userId: user.id })
        }),
      )
      .handle(
        'createMessage',
        Effect.fn('ChatHandler.createMessage')(
          function* ({ params, payload }) {
            const user = yield* CurrentUser
            return yield* createUserMessage.create(user.id, params.chatId, payload)
          },
          Effect.map(
            Struct.evolve({ userMessage: buildApiMessage, assistantMessage: buildApiMessage }),
          ),
        ),
      )
      .handle(
        'getMessage',
        Effect.fn('ChatHandler.getMessage')(function* ({ params }) {
          const user = yield* CurrentUser
          return yield* messageService.getOne({
            id: params.messageId,
            chatId: params.chatId,
            userId: user.id,
          })
        }, Effect.map(buildApiMessage)),
      )
  }),
)
