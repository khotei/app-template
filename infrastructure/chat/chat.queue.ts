import { Duration, Schema } from 'effect'

import { buildDeadLetterName, resources } from '@app-template/aws'
import { ChatId, MessageId } from '@app-template/domain/chat'
import type { QueueDefinition } from '@app-template/queue'

const { assistantMessage, chatTitle } = resources.queues

const buildDoublingDelay = (attempt: number) => Duration.seconds(2 ** (attempt - 1))

/**
 * The dead-letter queue of `queue`: it has no redrive, so its attempts never run out and a failing
 * handler retries at most five minutes apart.
 */
const buildDeadLetterQueue = <A, I>(
  queue: QueueDefinition<Schema.Codec<A, I>>,
): QueueDefinition<Schema.Codec<A, I>> => ({
  ...queue,
  name: buildDeadLetterName(queue.name),
  maxAttempts: Number.MAX_SAFE_INTEGER,
  retryDelay: (attempt) => Duration.min(buildDoublingDelay(attempt), Duration.minutes(5)),
})

/**
 * Who the api expects to answer a reply, and with which instructions, read by operators from the
 * outbox; the worker may run another model while a deploy rolls out.
 */
export class ReplyProvenance extends Schema.Class<ReplyProvenance>('ReplyProvenance')({
  provider: Schema.String,
  model: Schema.String,
  instructionsHash: Schema.String,
}) {}

export class GenerateAssistantMessage extends Schema.Class<GenerateAssistantMessage>(
  'GenerateAssistantMessage',
)({
  chatId: ChatId,
  messageId: MessageId,
  // The worker never reads it; required, so a job queued without it fails to decode.
  provenance: ReplyProvenance,
}) {}

/** The user is polling this message, so few short retries let it reach `failed` in seconds. */
export const assistantMessageQueue = {
  name: assistantMessage.name,
  schema: GenerateAssistantMessage,
  maxAttempts: assistantMessage.maxReceiveCount,
  retryDelay: buildDoublingDelay,
  jobId: (job) => job.messageId,
} satisfies QueueDefinition<typeof GenerateAssistantMessage>

export const assistantMessageDeadLetterQueue = buildDeadLetterQueue(assistantMessageQueue)

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
  jobId: (job) => job.chatId,
} satisfies QueueDefinition<typeof GenerateChatTitle>

export const chatTitleDeadLetterQueue = buildDeadLetterQueue(chatTitleQueue)
