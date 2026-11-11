import { DateTime } from 'effect'

import { UserId } from '@app-template/application/identity'
import { epoch } from '@app-template/packages/testing'

import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { buildChat } from '#chat/domain/chat.model'
import { buildAssistantMessage, buildUserMessage } from '#chat/domain/message.model'
import { buildRun } from '#chat/domain/run.model'
import { replyProvenance } from '#testing/chat/assistant.test-fake'

export const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
export const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
export const unknownChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000038')

export const owner = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
export const stranger = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')

/** An untitled chat of `owner`, created at `epoch`, so a later write shows as a moved `updatedAt`. */
export const chat = buildChat({ id: chatId, userId: owner, createdAt: epoch })

/** The first message of `chat`, the one its title job reads. */
export const firstMessage = buildUserMessage({
  id: messageId,
  chatId,
  text: 'Plan a weekend in Lisbon',
  createdAt: epoch,
})

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)

// A second apart: messages sharing a `createdAt` come back in no defined order.
const historyAt = (n: number) => DateTime.makeUnsafe(n * 1000)

/** The user's message at place `n` of `chat`'s history. */
export const userMessageAt = (n: number, text: string) =>
  buildUserMessage({ id: historyId(n), chatId, text, createdAt: historyAt(n) })

/** The assistant's message at place `n` of `chat`'s history. */
export const assistantMessageAt = (n: number, text: string) =>
  buildAssistantMessage({ id: historyId(n), chatId, text, createdAt: historyAt(n) })

/** The Run a send of `firstMessage` queues. */
export const queuedRun = buildRun({
  id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000031'),
  chat,
  userMessage: firstMessage,
  provenance: replyProvenance,
  createdAt: epoch,
})
