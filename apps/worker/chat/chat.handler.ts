import { Cause, Effect } from 'effect'

import {
  FirstMessageCreated,
  ReplyChatService,
  ReplyToMessage,
  TitleChatService,
} from '@app-template/application/chat'
import type { QueueName } from '@app-template/kernel/aws'
import { consumeQueue, type SqsEvent } from '@app-template/packages/queue'

const logFailed = (cause: Cause.Cause<unknown>) => Effect.logWarning('reply failed', cause)

/**
 * Replies to the job's user message and ends the job on any outcome but a bug, logging each end
 * but a defect, which the queue's consumer logs.
 */
export const replyToMessage = Effect.fn('ChatHandler.replyToMessage')(
  function* (job: ReplyToMessage) {
    const replies = yield* ReplyChatService
    return yield* replies.reply({
      userMessageId: job.messageId,
      chatId: job.chatId,
      userId: job.userId,
    })
  },
  Effect.catchTag('RunNotFoundError', () =>
    Effect.logInfo('reply skipped: its Run is done, failed or gone'),
  ),
  // The Run holds these failures now, so the job ends.
  Effect.catchTag(['RunStartedError', 'LlmError'], (error) => logFailed(Cause.fail(error))),
  // An interrupt skips every catch and tap, the consumer's log too; this handler still runs.
  Effect.onErrorIf(Cause.hasInterrupts, (cause) => logFailed(cause)),
  (reply, job) =>
    Effect.annotateLogs(reply, {
      messageId: job.messageId,
      chatId: job.chatId,
      userId: job.userId,
    }),
)

/**
 * Titles the user's chat from the event's first message; a chat gone, its message with it, or
 * titled meanwhile, or an assistant error, is logged and skipped.
 */
export const titleChat = Effect.fn('ChatHandler.titleChat')(
  function* (event: FirstMessageCreated) {
    const titles = yield* TitleChatService
    return yield* titles.title({ id: event.id, chatId: event.chatId, userId: event.userId })
  },
  Effect.catchTags({
    LlmError: (error) =>
      Effect.logWarning('title skipped: the assistant failed', Cause.fail(error)),
    ChatNotFoundError: () => Effect.logInfo('title skipped: chat deleted or titled'),
  }),
  (title, event) =>
    Effect.annotateLogs(title, {
      messageId: event.id,
      chatId: event.chatId,
      userId: event.userId,
    }),
)

/**
 * The chat's jobs and events, each consumed from its queue by its handlers, keyed by the queue's
 * name.
 */
export const ChatHandler = {
  [ReplyToMessage.queue.name]: consumeQueue(ReplyToMessage.queue, [replyToMessage]),
  [FirstMessageCreated.queue.name]: consumeQueue(FirstMessageCreated.queue, [titleChat]),
} satisfies Partial<Record<QueueName, (event: SqsEvent) => Effect.Effect<unknown, never, unknown>>>
