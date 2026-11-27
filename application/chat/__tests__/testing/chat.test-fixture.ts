import { DateTime, Option } from 'effect'

import { UserId } from '@app-template/application/user'
import { LlmError } from '@app-template/kernel/llm/model'
import { epoch } from '@app-template/packages/testing'

import { Chat } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'
import { Message } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'
import { Run, type RunUsage } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { AssistantReply } from '#chat/infrastructure/chat-assistant.llm'

export const assistantOverloaded = new LlmError({ cause: '529 overloaded' })

export const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
export const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
export const unknownChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000038')

export const owner = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')

/** An untitled chat of `owner`, created at `epoch`, so a later write shows as a moved `updatedAt`. */
export const chat = new Chat({ id: chatId, userId: owner, createdAt: epoch, updatedAt: epoch })

/** The first message of `chat`, the one its title reads. */
export const firstMessage = new Message({
  author: 'user',
  id: messageId,
  chatId,
  userId: owner,
  text: 'Plan a weekend in Lisbon',
  createdAt: epoch,
})

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)

// A second apart: messages sharing a `createdAt` come back in no defined order.
const historyAt = (n: number) => DateTime.makeUnsafe(n * 1000)

/** The user's message at place `n` of `chat`'s history. */
export const userMessageAt = (n: number, text: string) =>
  new Message({
    author: 'user',
    id: historyId(n),
    chatId,
    userId: owner,
    text,
    createdAt: historyAt(n),
  })

/** The assistant's message at place `n` of `chat`'s history. */
export const assistantMessageAt = (n: number, text: string) =>
  new Message({
    author: 'assistant',
    id: historyId(n),
    chatId,
    userId: owner,
    text,
    createdAt: historyAt(n),
  })

/** The Run an ask of `firstMessage` queues. */
export const queuedRun = new Run({
  id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000031'),
  chatId,
  userId: owner,
  userMessageId: firstMessage.id,
  createdAt: epoch,
  updatedAt: epoch,
})

/** A reply's usage whose prompt the cache served in part. */
export const runUsage: RunUsage = {
  model: 'claude-sonnet-5-5',
  promptTokens: 130,
  outputTokens: 5,
  cacheReadTokens: 100,
  cacheWriteTokens: 20,
}

/** `message` as read once a Run of `usage` answered it: a user's newest Run, a reply's own. */
export const answeredBy = (message: Message, usage: RunUsage = runUsage) =>
  new Message({
    ...message,
    run: Option.some(new Run({ ...queuedRun, status: 'done', usage: Option.some(usage) })),
  })

export const sureReply = new AssistantReply({ text: 'Sure.', usage: runUsage })
