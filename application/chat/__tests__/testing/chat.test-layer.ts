import { Effect, Layer } from 'effect'

import { ChatRepository, MessageRepository } from '@app-template/kernel/data'

import type { ChatId, MessageId } from '#chat/domain/chat.id'
import type { Chat } from '#chat/domain/chat.model'
import type { Message } from '#chat/domain/message.model'
import {
  decodeChat,
  decodeMessage,
  decodeMessages,
  encodeChat,
  encodeMessage,
} from '#chat/services/chat.mapper'

/** Stores `chat` before the layers it feeds start. */
export const insertChatLayer = (chat: Chat) =>
  encodeChat(chat).pipe(
    Effect.flatMap((row) => ChatRepository.use((chats) => chats.insert(row))),
    Layer.effectDiscard,
  )

export const selectChat = (id: ChatId) =>
  ChatRepository.use((chats) => chats.selectOne({ id })).pipe(Effect.flatMap(decodeChat))

export const deleteChat = (id: ChatId) => ChatRepository.use((chats) => chats.delete({ id }))

export const insertMessage = (message: Message) =>
  encodeMessage(message).pipe(
    Effect.flatMap((row) => MessageRepository.use((messages) => messages.insert(row))),
  )

/** Writes `message` over the stored one, whatever its status, as another writer would. */
export const updateMessage = (message: Message) =>
  encodeMessage(message).pipe(
    Effect.flatMap((row) =>
      MessageRepository.use((messages) => messages.update(row, { id: message.id })),
    ),
  )

export const selectMessage = (id: MessageId) =>
  MessageRepository.use((messages) => messages.selectOne({ id })).pipe(
    Effect.flatMap(decodeMessage),
  )

export const selectMessages = (chatId: ChatId) =>
  MessageRepository.use((messages) => messages.selectMany({ chatId })).pipe(
    Effect.flatMap(decodeMessages),
  )
