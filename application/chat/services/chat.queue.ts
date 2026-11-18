import { Schema } from 'effect'

import { resources } from '@app-template/kernel/aws'
import type { QueueDefinition } from '@app-template/packages/queue'

import { MessageId, RunId } from '#chat/domain/chat.id'

const { assistantMessage, chatTitle } = resources.queues

/** `runId` is the Run the worker drives; the Run holds what it answers and its provenance. */
export class GenerateAssistantMessage extends Schema.Class<GenerateAssistantMessage>(
  'GenerateAssistantMessage',
)({
  runId: RunId,
}) {}

export const assistantMessageQueue = {
  name: assistantMessage.name,
  schema: GenerateAssistantMessage,
} satisfies QueueDefinition<typeof GenerateAssistantMessage>

/** `messageId` is the chat's first user message; the worker reads the rest from its row. */
export class GenerateChatTitle extends Schema.Class<GenerateChatTitle>('GenerateChatTitle')({
  messageId: MessageId,
}) {}

export const chatTitleQueue = {
  name: chatTitle.name,
  schema: GenerateChatTitle,
} satisfies QueueDefinition<typeof GenerateChatTitle>
