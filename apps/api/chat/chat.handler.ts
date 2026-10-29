import { Array as Arr, Crypto, DateTime, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { DeleteChatUseCase, SendMessageUseCase } from '@app-template/application/chat'
import { buildChat, ChatId, ChatRepository, ChatService } from '@app-template/domain/chat'
import { generateId } from '@app-template/domain/shared'
import { Api, CurrentUser } from '@app-template/http-api'

import { toChat, toDetail, toMessage, toSummary } from '#api/shared/projections'

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chats = yield* ChatRepository
    const chatService = yield* ChatService
    const crypto = yield* Crypto.Crypto
    const sendMessage = yield* SendMessageUseCase
    const deleteChat = yield* DeleteChatUseCase

    return handlers
      .handle(
        'create',
        Effect.fn('ChatHandler.create')(function* () {
          const user = yield* CurrentUser
          const id = yield* generateId(crypto, ChatId.make)
          const createdAt = yield* DateTime.now
          const chat = buildChat({ id, userId: user.id, createdAt })

          yield* chats.insert(chat)
          return toChat(chat)
        }),
      )
      .handle(
        'list',
        Effect.fn('ChatHandler.list')(function* () {
          const user = yield* CurrentUser
          const summaries = yield* chatService.list(user.id)
          return Arr.map(summaries, toSummary)
        }),
      )
      .handle(
        'get',
        Effect.fn('ChatHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          const detail = yield* chatService.get(user.id, params.chatId)
          return toDetail(detail)
        }),
      )
      .handle(
        'rename',
        Effect.fn('ChatHandler.rename')(function* ({ params, payload }) {
          const user = yield* CurrentUser
          const renamed = yield* chatService.rename(user.id, params.chatId, payload.title)
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
          const detail = yield* chatService.getMessage(user.id, params.chatId, params.messageId)
          return toMessage(detail)
        }),
      )
  }),
)
