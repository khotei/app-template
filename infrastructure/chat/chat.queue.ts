import { Duration, Schema } from 'effect'

import { resources } from '@app-template/aws'
import { ChatId, MessageId } from '@app-template/domain/chat'
import type { QueueDefinition } from '@app-template/queue'

const { assistantMessage, chatTitle } = resources.queues

const doublingDelay = (attempt: number) => Duration.seconds(2 ** (attempt - 1))

export class GenerateAssistantMessage extends Schema.Class<GenerateAssistantMessage>(
  'GenerateAssistantMessage',
)({ chatId: ChatId, messageId: MessageId }) {}

/** The user is polling this message, so few short retries let it reach `failed` in seconds. */
export const assistantMessageQueue = {
  name: assistantMessage.name,
  schema: GenerateAssistantMessage,
  maxAttempts: assistantMessage.maxReceiveCount,
  retryDelay: doublingDelay,
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
  retryDelay: doublingDelay,
  jobId: (job) => job.chatId,
} satisfies QueueDefinition<typeof GenerateChatTitle>
