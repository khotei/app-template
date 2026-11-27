import { Cause, Context, Effect, Layer, Schema } from 'effect'

import { UserId } from '@app-template/application/user'
import { resources } from '@app-template/kernel/aws'
import { type QueueDefinition, type QueueError, QueueSender } from '@app-template/packages/queue'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import type { Run } from '#chat/domain/run.model'

const { replyToMessage, firstMessageCreated } = resources.queues

/**
 * `messageId` is the user's message the worker replies to, through its active Run, in the chat
 * `chatId`, of the user `userId`.
 */
export class ReplyToMessage extends Schema.Class<ReplyToMessage>('ReplyToMessage')({
  messageId: MessageId,
  chatId: ChatId,
  userId: UserId,
}) {
  static readonly queue = {
    name: replyToMessage.name,
    schema: this,
  } satisfies QueueDefinition<typeof ReplyToMessage>
}

/** The user's message `id` is the first of the chat `chatId`, of the user `userId`. */
export class FirstMessageCreated extends Schema.Class<FirstMessageCreated>('FirstMessageCreated')({
  id: MessageId,
  chatId: ChatId,
  userId: UserId,
}) {
  static readonly queue = {
    name: firstMessageCreated.name,
    schema: this,
  } satisfies QueueDefinition<typeof FirstMessageCreated>
}

/** Hands the worker the chat's jobs and events, each on its own queue. */
export class ChatQueue extends Context.Service<
  ChatQueue,
  {
    /**
     * Sends the job that replies to the Run's user message; one SQS refuses is logged and fails
     * with its `QueueError`.
     */
    readonly sendReplyToMessage: (run: Run) => Effect.Effect<void, QueueError>
    /**
     * Sends the event that the Run's user message is its chat's first; one SQS refuses is logged,
     * and the ask goes on.
     */
    readonly sendFirstMessageCreated: (run: Run) => Effect.Effect<void>
  }
>()('@app-template/application/chat/infrastructure/ChatQueue', {
  make: Effect.gen(function* () {
    const queue = yield* QueueSender

    const sendReplyToMessage = Effect.fn('ChatQueue.sendReplyToMessage')(
      (run: Run) =>
        queue.send(
          ReplyToMessage.queue,
          new ReplyToMessage({
            messageId: run.userMessageId,
            chatId: run.chatId,
            userId: run.userId,
          }),
        ),
      Effect.tapError((error) => Effect.logError('reply job not queued', Cause.fail(error))),
      (sent, run) =>
        Effect.annotateLogs(sent, {
          chatId: run.chatId,
          runId: run.id,
          messageId: run.userMessageId,
        }),
    )

    const sendFirstMessageCreated = Effect.fn('ChatQueue.sendFirstMessageCreated')(
      (run: Run) =>
        queue.send(
          FirstMessageCreated.queue,
          new FirstMessageCreated({
            id: run.userMessageId,
            chatId: run.chatId,
            userId: run.userId,
          }),
        ),
      Effect.ignore({ log: 'Error', message: 'first message event not queued' }),
      (sent, run) =>
        Effect.annotateLogs(sent, {
          messageId: run.userMessageId,
          chatId: run.chatId,
          userId: run.userId,
        }),
    )

    return { sendReplyToMessage, sendFirstMessageCreated }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
