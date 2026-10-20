import { DateTime } from 'effect'

import { ChatId, MessageId, type MessageInput } from '@app-template/domain/chat'

export const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
export const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
export const unknownChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000038')
export const unknownMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000039')

export const epoch = DateTime.makeUnsafe(0)
export const sentAt = DateTime.makeUnsafe('2026-10-18T12:00:00.000Z')

export const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })
