import { Array as Arr, Crypto, Effect, Layer } from 'effect'

import { type ChatId, MessageId } from '#domain/chat/chat.id'
import { ChatRepository } from '#domain/chat/chat.port'
import { ChatService } from '#domain/chat/chat.service'
import { buildAssistantMessage, buildUserMessage } from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import { generateId } from '#domain/shared/id'
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
    const crypto = yield* Crypto.Crypto

    const sendable = yield* chats.findSendable(userId, chatId, ask(text))
    const userMessageId = yield* generateId(crypto, MessageId.make)
    const userMessage = buildUserMessage({
      id: userMessageId,
      chatId,
      text,
      createdAt: sendable.at,
    })
    yield* messages.insert(userMessage)
    const assistantMessageId = yield* generateId(crypto, MessageId.make)
    const assistantMessage = buildAssistantMessage({
      id: assistantMessageId,
      chatId,
      createdAt: sendable.at,
    })
    yield* messages.insert(assistantMessage)
    return { userMessage, assistantMessage }
  })

export const selectMessages = (chatId: ChatId) =>
  MessageRepository.use((messages) => messages.selectMany({ chatId: [chatId] })).pipe(
    Effect.map(Arr.map(({ message }) => message)),
  )
