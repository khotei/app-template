import { Schedule, Schema } from 'effect'

import { ChatId, MessageId } from '@app-template/domain/chat'
import type { QueueDefinition } from '@app-template/queue'

export class GenerateAssistantMessage extends Schema.Class<GenerateAssistantMessage>(
  'GenerateAssistantMessage',
)({ chatId: ChatId, messageId: MessageId }) {}

/** The user is polling this message, so few short retries let it reach `failed` in seconds. */
export const assistantMessageQueue = {
  name: 'assistant-message',
  schema: GenerateAssistantMessage,
  maxAttempts: 3,
  retrySchedule: Schedule.exponential('1 second'),
  jobId: (job) => job.messageId,
} satisfies QueueDefinition<typeof GenerateAssistantMessage>

/** `messageId` is the chat's first user message; the worker reads its text from the store. */
export class GenerateChatTitle extends Schema.Class<GenerateChatTitle>('GenerateChatTitle')({
  chatId: ChatId,
  messageId: MessageId,
}) {}

export const chatTitleQueue = {
  name: 'chat-title',
  schema: GenerateChatTitle,
  maxAttempts: 5,
  retrySchedule: Schedule.exponential('1 second'),
  jobId: (job) => job.chatId,
} satisfies QueueDefinition<typeof GenerateChatTitle>
