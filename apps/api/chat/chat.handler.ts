import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { ChatService, MessageService } from '@app-template/chat/services'
import { Api } from '@app-template/http-api'
import { CurrentUser } from '@app-template/identity-contract'
import { SendMessageUseCase } from '@app-template/use-cases/chat'

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
          return yield* chatService.create(user.id)
        }),
      )
      .handle(
        'list',
        Effect.fn('ChatHandler.list')(function* () {
          const user = yield* CurrentUser
          return yield* chatService.list(user.id)
        }),
      )
      .handle(
        'get',
        Effect.fn('ChatHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          return yield* chatService.getOne({ id: params.chatId, userId: user.id })
        }),
      )
      .handle(
        'rename',
        Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          return yield* chatService.rename({ id: params.chatId, userId: user.id }, payload.title)
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
          return yield* sendMessage.send(user.id, params.chatId, payload)
        }),
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
        }),
      )
  }),
)
