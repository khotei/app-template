import { DateTime } from 'effect'

import { UserId } from '@app-template/identity-contract'
import { epoch } from '@app-template/testing'

import { ChatId, MessageId } from '#domain/chat.id'
import { buildChat, Chat } from '#domain/chat.model'
import {
  buildAssistantMessage,
  buildUserMessage,
  Message,
  type MessageInput,
} from '#domain/message.model'

export const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
export const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
export const unknownChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000038')
export const unknownMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000039')

export const owner = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
export const stranger = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')

/** An untitled chat of `owner`, created at `epoch`, so a later write shows as a moved `updatedAt`. */
export const chat = buildChat({ id: chatId, userId: owner, createdAt: epoch })

/** `chat` with its reply in work, as a send leaves it. */
export const queuedChat = new Chat({ ...chat, status: 'queued' })

/** The first message of `chat`, the one its title job reads. */
export const firstMessage = buildUserMessage({
  id: messageId,
  chatId,
  text: 'Plan a weekend in Lisbon',
  createdAt: epoch,
})

export const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)

// A second apart: messages sharing a `createdAt` come back in no defined order.
const historyAt = (n: number) => DateTime.makeUnsafe(n * 1000)

/** The user's message at place `n` of `chat`'s history. */
export const userMessageAt = (n: number, text: string) =>
  buildUserMessage({ id: historyId(n), chatId, text, createdAt: historyAt(n) })

/** The assistant's message at place `n` of `chat`'s history. */
export const assistantMessageAt = (n: number) =>
  buildAssistantMessage({ id: historyId(n), chatId, createdAt: historyAt(n) })

/** `message` as a reply settled with `text` is stored. */
export const asCompleted = (message: Message, text: string) =>
  new Message({ ...message, status: 'done', text })
