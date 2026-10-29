import { Array as Arr, Effect, Layer } from 'effect'

import type { ChatId } from '#domain/chat/chat.id'
import { ChatRepository } from '#domain/chat/chat.port'
import { ChatService } from '#domain/chat/chat.service'
import {
  buildAssistantMessage,
  buildUserMessage,
  generateMessageId,
} from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import { ask, chat } from '#domain/testing/chat.test-fixture'
import { RepositoryStackTest } from '#domain/testing/repository-stack.test-layer'
import type { UserId } from '#domain/user/user.id'

const insertChat = Layer.effectDiscard(ChatRepository.use((chats) => chats.insert(chat)))

/** The chat services over the memory layers, on fresh rows where `chat` exists; needs `Crypto`. */
export const ChatTest = ChatService.layer.pipe(
  Layer.provideMerge(insertChat),
  Layer.provideMerge(RepositoryStackTest),
)

/** Stores a user message with its queued reply, as a send does. */
export const send = (userId: UserId, chatId: ChatId, text: string) =>
  Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageRepository

    const sendable = yield* chats.findSendable(userId, chatId, ask(text))
    const userMessageId = yield* generateMessageId
    const userMessage = buildUserMessage({
      id: userMessageId,
      chatId,
      text,
      createdAt: sendable.at,
    })
    yield* messages.insert(userMessage)
    const assistantMessageId = yield* generateMessageId
    const assistantMessage = buildAssistantMessage({
      id: assistantMessageId,
      chatId,
      createdAt: sendable.at,
    })
    yield* messages.insert(assistantMessage)
    return { userMessage, assistantMessage }
  })

export const selectMessages = (chatId: ChatId) =>
  MessageRepository.use((messages) => messages.selectByChat(chatId)).pipe(
    Effect.map(Arr.map(({ message }) => message)),
  )
