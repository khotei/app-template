import { Layer } from 'effect'

import type { ChatId, MessageId } from '#domain/chat.id'
import type { Chat } from '#domain/chat.model'
import { ChatRepository } from '#domain/chat.port'
import type { Message } from '#domain/message.model'
import { MessageRepository } from '#domain/message.port'
import { AttachmentRepositoryTest, AttachmentRows } from '#testing/attachment.test-fake'
import {
  ChatRepositoryTest,
  ChatRows,
  MessageRepositoryTest,
  MessageRows,
} from '#testing/chat.test-fake'

/** Chat's three repositories over fresh rows, the rows in context for a test to arrange or read. */
export const RepositoryStackTest = Layer.mergeAll(
  ChatRepositoryTest,
  MessageRepositoryTest,
  AttachmentRepositoryTest,
).pipe(Layer.provideMerge(Layer.mergeAll(ChatRows.layer, MessageRows.layer, AttachmentRows.layer)))

/** Stores `chat` before the layers it feeds start. */
export const insertChatLayer = (chat: Chat) =>
  Layer.effectDiscard(ChatRepository.use((chats) => chats.insert(chat)))

export const selectChat = (id: ChatId) => ChatRepository.use((chats) => chats.selectOne({ id }))

export const deleteChat = (id: ChatId) => ChatRepository.use((chats) => chats.delete({ id }))

export const insertMessage = (message: Message) =>
  MessageRepository.use((messages) => messages.insert(message))

export const selectMessage = (id: MessageId) =>
  MessageRepository.use((messages) => messages.selectOne({ id }))

export const selectMessages = (chatId: ChatId) =>
  MessageRepository.use((messages) => messages.selectMany({ chatId }))
