import { Cause, Effect } from 'effect'

import {
  ReplyChatService,
  ReplyToMessage,
  TitleChat,
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
    return yield* replies.reply(job.messageId)
  },
  Effect.catchTag('RunNotFoundError', () =>
    Effect.logInfo('reply skipped: its Run is done, failed or gone'),
  ),
  // The Run holds these failures now, so the job ends.
  Effect.catchTag(['RunStartedError', 'LlmError'], (error) => logFailed(Cause.fail(error))),
  // An interrupt skips every catch and tap, the consumer's log too; this handler still runs.
  Effect.onErrorIf(Cause.hasInterrupts, (cause) => logFailed(cause)),
  (reply, job) => Effect.annotateLogs(reply, { messageId: job.messageId }),
)

/**
 * Titles the job's chat; a chat gone or titled meanwhile, or an assistant error, is logged and
 * skipped.
 */
export const titleChat = Effect.fn('ChatHandler.titleChat')(
  function* (job: TitleChat) {
    const titles = yield* TitleChatService
    return yield* titles.title(job.chatId)
  },
  Effect.catchTags({
    LlmError: (error) =>
      Effect.logWarning('title skipped: the assistant failed', Cause.fail(error)),
    ChatNotFoundError: () => Effect.logInfo('title skipped: chat deleted or titled'),
  }),
  (title, job) => Effect.annotateLogs(title, { chatId: job.chatId }),
)

/** The chat's jobs, each consumed from its queue by its handlers, keyed by the queue's name. */
export const ChatHandler = {
  [ReplyToMessage.queue.name]: consumeQueue(ReplyToMessage.queue, [replyToMessage]),
  [TitleChat.queue.name]: consumeQueue(TitleChat.queue, [titleChat]),
} satisfies Partial<Record<QueueName, (event: SqsEvent) => Effect.Effect<unknown, never, unknown>>>
