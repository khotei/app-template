import { Array as Arr, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { ChatService, MessageService, RunService } from '@app-template/application/chat'
import { createUserMessage, listMessages, retryRun } from '@app-template/application/use-cases'

import { Api } from '#api/api'
import { buildApiChat } from '#api/chat/chat.mapper'
import { CurrentUser } from '#api/shared/security'

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chatService = yield* ChatService
    const messageService = yield* MessageService
    const runService = yield* RunService

    return handlers.handleAll({
      create: Effect.fn('ChatHandler.create')(function* () {
        const user = yield* CurrentUser
        return yield* chatService.create(user.id)
      }, Effect.map(buildApiChat)),
      list: Effect.fn('ChatHandler.list')(
        function* () {
          const user = yield* CurrentUser
          return yield* chatService.list(user.id)
        },
        Effect.map(Arr.map(buildApiChat)),
      ),
      get: Effect.fn('ChatHandler.get')(function* ({ params }) {
        const user = yield* CurrentUser
        return yield* chatService.getOne({ id: params.chatId, userId: user.id })
      }, Effect.map(buildApiChat)),
      rename: Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
        const user = yield* CurrentUser
        return yield* chatService.rename({ id: params.chatId, userId: user.id }, payload.title)
      }, Effect.map(buildApiChat)),
      delete: Effect.fn('ChatHandler.delete')(function* ({ params }) {
        const user = yield* CurrentUser
        yield* chatService.delete({ id: params.chatId, userId: user.id })
      }),
      listMessages: Effect.fn('ChatHandler.listMessages')(function* ({ params }) {
        const user = yield* CurrentUser
        return yield* listMessages(user.id, params.chatId)
      }),
      createMessage: Effect.fn('ChatHandler.createMessage')(function* ({ params, payload }) {
        const user = yield* CurrentUser
        return yield* createUserMessage(user.id, params.chatId, payload)
      }),
      retryRun: Effect.fn('ChatHandler.retryRun')(function* ({ params }) {
        const user = yield* CurrentUser
        return yield* retryRun(user.id, params.chatId, params.userMessageId)
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
