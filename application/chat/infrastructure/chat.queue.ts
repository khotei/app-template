import { Cause, Effect, Schema } from 'effect'

import { resources } from '@app-template/kernel/aws'
import { type QueueDefinition, QueueSender } from '@app-template/packages/queue'

import type { MessageFields } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'
import type { Run } from '#chat/domain/run.model'

const { assistantMessage, chatTitle } = resources.queues

/** `messageId` is the user's message the worker replies to, through its active Run. */
export class GenerateAssistantMessage extends Schema.Class<GenerateAssistantMessage>(
  'GenerateAssistantMessage',
)({
  messageId: MessageId,
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

/**
 * Sends the job that replies to the Run's user message; one SQS refuses is logged and fails with
 * its `QueueError`.
 */
export const sendGenerateAssistantMessage = Effect.fn('sendGenerateAssistantMessage')((run: Run) =>
  QueueSender.use((queue) =>
    queue.send(
      assistantMessageQueue,
      new GenerateAssistantMessage({ messageId: run.userMessageId }),
    ),
  ).pipe(
    Effect.tapError((error) => Effect.logError('assistant message not queued', Cause.fail(error))),
    Effect.annotateLogs({ chatId: run.chatId, runId: run.id, messageId: run.userMessageId }),
  ),
)

/** Sends the job that titles the message's chat; one SQS refuses is logged, and the send goes on. */
export const sendGenerateChatTitle = Effect.fn('sendGenerateChatTitle')(
  (message: Pick<MessageFields, 'id' | 'chatId'>) =>
    QueueSender.use((queue) =>
      queue.send(chatTitleQueue, new GenerateChatTitle({ messageId: message.id })),
    ).pipe(
      Effect.ignore({ log: 'Error', message: 'chat title not queued' }),
      Effect.annotateLogs({ chatId: message.chatId, messageId: message.id }),
    ),
)
