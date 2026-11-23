import { Cause, Effect, Schema } from 'effect'

import { resources } from '@app-template/kernel/aws'
import { type QueueDefinition, QueueSender } from '@app-template/packages/queue'

import type { Chat } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import type { Run } from '#chat/domain/run.model'

const { replyToMessage, titleChat } = resources.queues

/** `messageId` is the user's message the worker replies to, through its active Run. */
export class ReplyToMessage extends Schema.Class<ReplyToMessage>('ReplyToMessage')({
  messageId: MessageId,
}) {}

export const replyToMessageQueue = {
  name: replyToMessage.name,
  schema: ReplyToMessage,
} satisfies QueueDefinition<typeof ReplyToMessage>

/** `chatId` is the chat the worker titles, from the first message it reads there. */
export class TitleChat extends Schema.Class<TitleChat>('TitleChat')({
  chatId: ChatId,
}) {}

export const titleChatQueue = {
  name: titleChat.name,
  schema: TitleChat,
} satisfies QueueDefinition<typeof TitleChat>

/**
 * Sends the job that replies to the Run's user message; one SQS refuses is logged and fails with
 * its `QueueError`.
 */
export const sendReplyToMessage = Effect.fn('sendReplyToMessage')(
  (run: Run) =>
    QueueSender.use((queue) =>
      queue.send(replyToMessageQueue, new ReplyToMessage({ messageId: run.userMessageId })),
    ),
  Effect.tapError((error) => Effect.logError('reply job not queued', Cause.fail(error))),
  (sent, run) =>
    Effect.annotateLogs(sent, { chatId: run.chatId, runId: run.id, messageId: run.userMessageId }),
)

/** Sends the job that titles the chat; one SQS refuses is logged, and the ask goes on. */
export const sendTitleChat = Effect.fn('sendTitleChat')(
  (chat: Chat) =>
    QueueSender.use((queue) => queue.send(titleChatQueue, new TitleChat({ chatId: chat.id }))),
  Effect.ignore({ log: 'Error', message: 'title job not queued' }),
  (sent, chat) => Effect.annotateLogs(sent, { chatId: chat.id }),
)
