import { Effect, Layer, Schema } from 'effect'

import { ChatRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'
import { decodeRowWith, encodeRowWith } from '@app-template/packages/db'

import type { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Chat, ChatFields } from '#chat/domain/chat.model'
import { Message, MessageFields } from '#chat/domain/message.model'
import { Run } from '#chat/domain/run.model'
import { RunFields } from '#chat/domain/run-fields.model'

/** Stores `chat` before the layers it feeds start. */
export const insertChatLayer = (chat: Chat) =>
  encodeRowWith(ChatFields)(chat).pipe(
    Effect.flatMap((row) => ChatRepository.use((chats) => chats.insert(row))),
    Layer.effectDiscard,
  )

export const selectChat = (id: ChatId) =>
  ChatRepository.use((chats) => chats.selectOne({ id })).pipe(
    Effect.flatMap(decodeRowWith(Schema.Option(Chat))),
  )

export const deleteChat = (id: ChatId) => ChatRepository.use((chats) => chats.delete({ id }))

export const insertMessage = (message: Message) =>
  encodeRowWith(MessageFields)(message).pipe(
    Effect.flatMap((row) => MessageRepository.use((messages) => messages.insert(row))),
  )

export const selectMessage = (id: MessageId) =>
  MessageRepository.use((messages) => messages.selectOne({ id })).pipe(
    Effect.flatMap(decodeRowWith(Schema.Option(Message))),
  )

export const selectMessages = (chatId: ChatId) =>
  MessageRepository.use((messages) => messages.selectMany({ chatId })).pipe(
    Effect.flatMap(decodeRowWith(Schema.Array(Message))),
  )

/** Stores `run` beside the message it answers, which must be stored already. */
export const insertRun = (run: Run) =>
  encodeRowWith(RunFields)(run).pipe(
    Effect.flatMap((row) => RunRepository.use((runs) => runs.insert(row))),
  )

/** Writes `run` over the stored one, whatever its status, as another worker would. */
export const updateRun = (run: Run) =>
  encodeRowWith(RunFields)(run).pipe(
    Effect.flatMap((row) => RunRepository.use((runs) => runs.update(row, { id: run.id }))),
  )

export const selectRun = (id: RunId) =>
  RunRepository.use((runs) => runs.selectOne({ id })).pipe(
    Effect.flatMap(decodeRowWith(Schema.Option(Run))),
  )
