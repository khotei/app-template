import { DateTime } from 'effect'

import { ChatId, MessageId } from '#domain/chat/chat.id'
import { buildChat } from '#domain/chat/chat.model'
import type { MessageInput } from '#domain/chat/message.model'
import { owner } from '#domain/testing/user.test-fixture'

export const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
export const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
export const unknownChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000038')
export const unknownMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000039')

export const epoch = DateTime.makeUnsafe(0)

/** An untitled chat of `owner`, created at `epoch`, so a later write shows as a moved `updatedAt`. */
export const chat = buildChat({ id: chatId, userId: owner, createdAt: epoch })

export const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })
