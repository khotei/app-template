import { Effect, Layer } from 'effect'

import { ChatRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'

import type { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import type { Chat } from '#chat/domain/chat.model'
import type { Message } from '#chat/domain/message.model'
import type { Run } from '#chat/domain/run.model'
import { decodeChat, encodeChat } from '#chat/services/chat.mapper'
import { decodeMessage, decodeMessages, encodeMessage } from '#chat/services/message.mapper'
import { decodeRun, encodeRun } from '#chat/services/run.mapper'

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

export const selectMessage = (id: MessageId) =>
  MessageRepository.use((messages) => messages.selectOne({ id })).pipe(
    Effect.flatMap(decodeMessage),
  )

export const selectMessages = (chatId: ChatId) =>
  MessageRepository.use((messages) => messages.selectMany({ chatId })).pipe(
    Effect.flatMap(decodeMessages),
  )

/** Stores `run` beside the message it answers, which must be stored already. */
export const insertRun = (run: Run) =>
  encodeRun(run).pipe(Effect.flatMap((row) => RunRepository.use((runs) => runs.insert(row))))

/** Writes `run` over the stored one, whatever its status, as another worker would. */
export const updateRun = (run: Run) =>
  encodeRun(run).pipe(
    Effect.flatMap((row) => RunRepository.use((runs) => runs.update(row, { id: run.id }))),
  )

export const selectRun = (id: RunId) =>
  RunRepository.use((runs) => runs.selectOne({ id })).pipe(Effect.flatMap(decodeRun))
