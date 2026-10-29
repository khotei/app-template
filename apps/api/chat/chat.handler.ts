import { Array as Arr, Crypto, DateTime, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { DeleteChatUseCase, SendMessageUseCase } from '@app-template/application/chat'
import {
  buildChat,
  ChatId,
  ChatRepository,
  ChatService,
  MessageNotFoundError,
  MessageRepository,
} from '@app-template/domain/chat'
import { generateId } from '@app-template/domain/shared'
import { Api, CurrentUser } from '@app-template/http-api'

import { toChat, toChatWithStatus, toMessage } from '#api/shared/projections'

export const ChatHandler = HttpApiBuilder.group(
  Api,
  'chats',
  Effect.fnUntraced(function* (handlers) {
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
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
          const found = yield* chats.selectByUser(user.id)
          return Arr.map(found, toChat)
        }),
      )
      .handle(
        'get',
        Effect.fn('ChatHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          const chat = yield* chatService.findOne({ id: params.chatId, userId: user.id })
          return toChatWithStatus(chat)
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
          const message = yield* messages
            .selectOne({ id: params.messageId, chatId: params.chatId, userId: user.id })
            .pipe(
              Effect.flatMap(
                Effect.fromOption(() => new MessageNotFoundError({ id: params.messageId })),
              ),
            )
          return toMessage(message)
        }),
      )
  }),
)
