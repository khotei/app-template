import { DateTime } from 'effect'

import { buildChat, ChatId, MessageId, type MessageInput } from '@app-template/domain/chat'

import { owner } from '#application/testing/user.fixture'

export const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
export const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
export const unknownChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000038')
export const unknownMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000039')

export const epoch = DateTime.makeUnsafe(0)

/** An untitled chat of `owner`, created at `epoch`, so a later write shows as a moved `updatedAt`. */
export const chat = buildChat({ id: chatId, userId: owner, createdAt: epoch })

export const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })
