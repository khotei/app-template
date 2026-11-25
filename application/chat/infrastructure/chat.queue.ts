import { Cause, Context, Effect, Layer, Schema } from 'effect'

import { resources } from '@app-template/kernel/aws'
import { type QueueDefinition, type QueueError, QueueSender } from '@app-template/packages/queue'

import type { Chat } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import type { Run } from '#chat/domain/run.model'

const { replyToMessage, titleChat } = resources.queues

/** `messageId` is the user's message the worker replies to, through its active Run. */
export class ReplyToMessage extends Schema.Class<ReplyToMessage>('ReplyToMessage')({
  messageId: MessageId,
}) {
  static readonly queue = {
    name: replyToMessage.name,
    schema: this,
  } satisfies QueueDefinition<typeof ReplyToMessage>
}

/** `chatId` is the chat the worker titles, from the first message it reads there. */
export class TitleChat extends Schema.Class<TitleChat>('TitleChat')({
  chatId: ChatId,
}) {
  static readonly queue = {
    name: titleChat.name,
    schema: this,
  } satisfies QueueDefinition<typeof TitleChat>
}

/** Hands the worker the chat's jobs, each on its own queue. */
export class ChatQueue extends Context.Service<
  ChatQueue,
  {
    /**
     * Sends the job that replies to the Run's user message; one SQS refuses is logged and fails
     * with its `QueueError`.
     */
    readonly sendReplyToMessage: (run: Run) => Effect.Effect<void, QueueError>
    /** Sends the job that titles the chat; one SQS refuses is logged, and the ask goes on. */
    readonly sendTitleChat: (chat: Chat) => Effect.Effect<void>
  }
>()('@app-template/application/chat/infrastructure/ChatQueue', {
  make: Effect.gen(function* () {
    const queue = yield* QueueSender

    const sendReplyToMessage = Effect.fn('ChatQueue.sendReplyToMessage')(
      (run: Run) =>
        queue.send(ReplyToMessage.queue, new ReplyToMessage({ messageId: run.userMessageId })),
      Effect.tapError((error) => Effect.logError('reply job not queued', Cause.fail(error))),
      (sent, run) =>
        Effect.annotateLogs(sent, {
          chatId: run.chatId,
          runId: run.id,
          messageId: run.userMessageId,
        }),
    )

    const sendTitleChat = Effect.fn('ChatQueue.sendTitleChat')(
      (chat: Chat) => queue.send(TitleChat.queue, new TitleChat({ chatId: chat.id })),
      Effect.ignore({ log: 'Error', message: 'title job not queued' }),
      (sent, chat) => Effect.annotateLogs(sent, { chatId: chat.id }),
    )

    return { sendReplyToMessage, sendTitleChat }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
