import { Layer } from 'effect'

import type { ChatId, MessageId } from '#domain/chat/chat.id'
import type { Chat } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import type { Message } from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import { AttachmentRepositoryTest, AttachmentRows } from '#domain/testing/attachment.test-fake'
import {
  ChatRepositoryTest,
  ChatRows,
  MessageRepositoryTest,
  MessageRows,
} from '#domain/testing/chat.test-fake'
import { UserRepositoryTest, UserRows } from '#domain/testing/user.test-fake'

/** The four repositories over fresh rows, the rows in context for a test to arrange or read. */
export const RepositoryStackTest = Layer.mergeAll(
  UserRepositoryTest,
  ChatRepositoryTest,
  MessageRepositoryTest,
  AttachmentRepositoryTest,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(UserRows.layer, ChatRows.layer, MessageRows.layer, AttachmentRows.layer),
  ),
)

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
