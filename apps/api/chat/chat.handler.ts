import { Array as Arr, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { DeleteChatUseCase, SendMessageUseCase } from '@app-template/application/chat'
import { ChatService, MessageService } from '@app-template/domain/chat'
import { Api, CurrentUser } from '@app-template/http-api'

import { toChat, toDetail, toMessage, toSummary } from '#api/shared/projections'

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const sendMessage = yield* SendMessageUseCase
    const deleteChat = yield* DeleteChatUseCase

    return handlers
      .handle(
        'create',
        Effect.fn('ChatHandler.create')(function* () {
          const user = yield* CurrentUser
          const chat = yield* chats.create(user.id)
          return toChat(chat)
        }),
      )
      .handle(
        'list',
        Effect.fn('ChatHandler.list')(function* () {
          const user = yield* CurrentUser
          const summaries = yield* chats.list(user.id)
          return Arr.map(summaries, toSummary)
        }),
      )
      .handle(
        'get',
        Effect.fn('ChatHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          const detail = yield* chats.get(user.id, params.chatId)
          return toDetail(detail)
        }),
      )
      .handle(
        'rename',
        Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          const renamed = yield* chats.rename(user.id, params.chatId, payload.title)
          return toChat(renamed)
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
          const detail = yield* messages.get(user.id, params.chatId, params.messageId)
          return toMessage(detail)
        }),
      )
  }),
)
