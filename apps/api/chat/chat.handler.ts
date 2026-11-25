import { Effect, Option } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import {
  AskChatService,
  ChatService,
  MessageService,
  RunService,
} from '@app-template/application/chat'

import { Api } from '#api/api'
import { CurrentUser } from '#api/shared/api-security'

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
        const user = yield* CurrentUser
        return yield* chatService.create(user.id)
      }),
      list: Effect.fn('ChatHandler.list')(function* () {
        const user = yield* CurrentUser
        return yield* chatService.list(user.id)
      }),
      get: Effect.fn('ChatHandler.get')(function* ({ params }) {
        const user = yield* CurrentUser
        return yield* chatService.getOne({ id: params.chatId, userId: user.id })
      }),
      rename: Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
        const user = yield* CurrentUser
        return yield* chatService.update(
          { title: Option.some(payload.title) },
          { id: params.chatId, userId: user.id },
        )
      }),
      delete: Effect.fn('ChatHandler.delete')(function* ({ params }) {
        const user = yield* CurrentUser
        yield* chatService.delete({ id: params.chatId, userId: user.id })
      }),
      listMessages: Effect.fn('ChatHandler.listMessages')(function* ({ params }) {
        const user = yield* CurrentUser
        yield* chatService.getOne({ id: params.chatId, userId: user.id })
        return yield* messageService.getMany({ chatId: params.chatId })
      }),
      ask: Effect.fn('ChatHandler.ask')(function* ({ params, payload }) {
        const user = yield* CurrentUser
        return yield* askService.ask({ chatId: params.chatId, userId: user.id }, payload.text)
      }),
      retryRun: Effect.fn('ChatHandler.retryRun')(function* ({ params }) {
        const user = yield* CurrentUser
        return yield* askService.retry({ chatId: params.chatId, userId: user.id })
      }),
      getMessage: Effect.fn('ChatHandler.getMessage')(function* ({ params }) {
        const user = yield* CurrentUser
        return yield* messageService.getOne({
          id: params.messageId,
          chatId: params.chatId,
          userId: user.id,
        })
      }),
      getRun: Effect.fn('ChatHandler.getRun')(function* ({ params }) {
        const user = yield* CurrentUser
        return yield* runService.getOne({
          id: params.runId,
          chatId: params.chatId,
          userId: user.id,
        })
      }),
    })
  }),
)
