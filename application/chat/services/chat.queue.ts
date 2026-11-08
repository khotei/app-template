import { Schema } from 'effect'

import { resources } from '@app-template/kernel/aws'
import { buildDoublingDelay, type QueueDefinition } from '@app-template/packages/queue-2'

import { ReplyProvenance } from '#chat/domain/assistant.port'
import { ChatId, MessageId } from '#chat/domain/chat.id'

const { assistantMessage, chatTitle } = resources.queues

export class GenerateAssistantMessage extends Schema.Class<GenerateAssistantMessage>(
  'GenerateAssistantMessage',
)({
  chatId: ChatId,
  messageId: MessageId,
  // Optional on decode: a job queued before the field existed must still reach the worker, or its
  // chat stays queued behind a body no attempt decodes.
  provenance: Schema.OptionFromOptionalKey(ReplyProvenance),
}) {}

/** The user is polling this message, so few short retries let it reach `failed` in seconds. */
export const assistantMessageQueue = {
  name: assistantMessage.name,
  schema: GenerateAssistantMessage,
  maxAttempts: assistantMessage.maxReceiveCount,
  retryDelay: buildDoublingDelay,
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
  retryDelay: buildDoublingDelay,
} satisfies QueueDefinition<typeof GenerateChatTitle>
