import { Array as Arr, DateTime, Effect, Layer } from 'effect'

import type { ChatId } from '#domain/chat/chat.id'
import { ChatRepository } from '#domain/chat/chat.port'
import { ChatService } from '#domain/chat/chat.service'
import type { Message } from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import { MessageService } from '#domain/chat/message.service'
import { chat } from '#domain/testing/chat.test-fixture'
import { RepositoryStackTest } from '#domain/testing/index'
import type { UserId } from '#domain/user/user.id'

const insertChat = Layer.effectDiscard(
  Effect.flatMap(ChatRepository, (chats) => chats.insert(chat)),
)

/** The chat services over the memory layers, on fresh rows where `chat` exists; needs `Crypto`. */
export const ChatTest = Layer.mergeAll(ChatService.layer, MessageService.layer).pipe(
  Layer.provideMerge(insertChat),
  Layer.provideMerge(RepositoryStackTest),
)

/** Stores a user message with its queued reply, as a send does. */
export const send = (userId: UserId, chatId: ChatId, text: string) =>
  Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService

    const sendable = yield* chats.findSendable(userId, chatId, { text, attachmentIds: [] })
    const userMessage = yield* messages.addUserMessage(sendable)
    const assistantMessage = yield* messages.addAssistantMessage(sendable)
    return { userMessage, assistantMessage }
  })

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
export const settle = (message: Message) =>
  Effect.gen(function* () {
    const messages = yield* MessageService
    const at = yield* DateTime.now

    const prepared = yield* messages.prepare(message, at)
    return yield* messages.complete(prepared, { text: 'Sure.', at })
  })

export const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectOne({ id: chatId }))

export const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId)).pipe(
    Effect.map(Arr.map(({ message }) => message)),
  )
