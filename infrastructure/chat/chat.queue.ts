import { Schedule, Schema } from 'effect'

import { resources } from '@app-template/aws'
import { ChatId, MessageId } from '@app-template/domain/chat'
import type { QueueDefinition } from '@app-template/queue'

const { assistantMessage, chatTitle } = resources.queues

export class GenerateAssistantMessage extends Schema.Class<GenerateAssistantMessage>(
  'GenerateAssistantMessage',
)({ chatId: ChatId, messageId: MessageId }) {}

/**
 * The user is polling this message, so few short retries let it reach `failed` in seconds; the
 * inventory's last attempt only settles a reply the last retry left active, so the job never
 * calls the model on it.
 */
export const replyAttempts = assistantMessage.maxReceiveCount - 1

export const assistantMessageQueue = {
  name: assistantMessage.name,
  schema: GenerateAssistantMessage,
  maxAttempts: assistantMessage.maxReceiveCount,
  retrySchedule: Schedule.exponential('1 second'),
  jobId: (job) => job.messageId,
} satisfies QueueDefinition<typeof GenerateAssistantMessage>

/** `messageId` is the chat's first user message; the worker reads its text from the store. */
export class GenerateChatTitle extends Schema.Class<GenerateChatTitle>('GenerateChatTitle')({
  chatId: ChatId,
  messageId: MessageId,
}) {}

export const chatTitleQueue = {
  name: chatTitle.name,
  schema: GenerateChatTitle,
  maxAttempts: chatTitle.maxReceiveCount,
  retrySchedule: Schedule.exponential('1 second'),
  jobId: (job) => job.chatId,
} satisfies QueueDefinition<typeof GenerateChatTitle>
