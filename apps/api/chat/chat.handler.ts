import { Array as Arr, Effect, Option } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import {
  AskChatService,
  ChatService,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import { Api, Identity } from '@app-template/application/http-api'
import { askChat } from '@app-template/application/use-cases'

import { buildApiChat } from '#api/chat/chat.mapper'

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chatService = yield* ChatService
    const messageService = yield* MessageService
    const runService = yield* RunService
    const askService = yield* AskChatService

    return handlers.handleAll({
      create: Effect.fn('ChatHandler.create')(function* () {
        const identity = yield* Identity
        return yield* chatService.create(identity.userId)
      }, Effect.map(buildApiChat)),
      list: Effect.fn('ChatHandler.list')(
        function* () {
          const identity = yield* Identity
          return yield* chatService.list(identity.userId)
        },
        Effect.map(Arr.map(buildApiChat)),
      ),
      get: Effect.fn('ChatHandler.get')(function* ({ params }) {
        const identity = yield* Identity
        return yield* chatService.getOne({ id: params.chatId, userId: identity.userId })
      }, Effect.map(buildApiChat)),
      rename: Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
        const identity = yield* Identity
        return yield* chatService.update(
          { title: Option.some(payload.title) },
          { id: params.chatId, userId: identity.userId },
        )
      }, Effect.map(buildApiChat)),
      delete: Effect.fn('ChatHandler.delete')(function* ({ params }) {
        const identity = yield* Identity
        yield* chatService.delete({ id: params.chatId, userId: identity.userId })
      }),
      listMessages: Effect.fn('ChatHandler.listMessages')(function* ({ params }) {
        const identity = yield* Identity
        yield* chatService.getOne({ id: params.chatId, userId: identity.userId })
        return yield* messageService.getMany({ chatId: params.chatId })
      }),
      ask: Effect.fn('ChatHandler.ask')(function* ({ params, payload }) {
        const identity = yield* Identity
        return yield* askChat({ id: params.chatId, userId: identity.userId }, payload.text)
      }),
      retryRun: Effect.fn('ChatHandler.retryRun')(function* ({ params }) {
        const identity = yield* Identity
        return yield* askService.retry({ id: params.chatId, userId: identity.userId })
      }),
      getMessage: Effect.fn('ChatHandler.getMessage')(function* ({ params }) {
        const identity = yield* Identity
        return yield* messageService.getOne({
          id: params.messageId,
          chatId: params.chatId,
          userId: identity.userId,
        })
      }),
      getRun: Effect.fn('ChatHandler.getRun')(function* ({ params }) {
        const identity = yield* Identity
        return yield* runService.getOne({
          id: params.runId,
          chatId: params.chatId,
          userId: identity.userId,
        })
      }),
    })
  }),
)
