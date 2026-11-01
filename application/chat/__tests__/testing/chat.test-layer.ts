import { Effect, Layer } from 'effect'

import { ChatRepository, MessageRepository } from '@app-template/kernel/data/chat'

import type { ChatId, MessageId } from '#domain/chat.id'
import type { Chat } from '#domain/chat.model'
import type { Message } from '#domain/message.model'
import {
  decodeChat,
  decodeMessage,
  decodeMessages,
  encodeChat,
  encodeMessage,
} from '#services/chat.mapper'

export const insertChat = (chat: Chat) =>
  encodeChat(chat).pipe(Effect.flatMap((row) => ChatRepository.use((chats) => chats.insert(row))))

/** Stores `chat` before the layers it feeds start. */
export const insertChatLayer = (chat: Chat) => Layer.effectDiscard(insertChat(chat))

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
