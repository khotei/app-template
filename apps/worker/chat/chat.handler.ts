import { Cause, Effect } from 'effect'

import {
  ChatInitialized,
  MessageRetried,
  ReplyChatService,
  TitleChatService,
  UserMessageCreated,
} from '@app-template/application/chat'
import type { QueueName } from '@app-template/kernel/aws'
import { consumeQueue, type SqsEvent } from '@app-template/packages/queue'

const logFailed = (cause: Cause.Cause<unknown>) => Effect.logWarning('reply failed', cause)

/**
 * Replies to the event's user message, stored or retried, and ends its handling on any outcome but
 * a bug, logging each end but a defect, which the queue's consumer logs.
 */
export const replyToMessage = Effect.fn('ChatHandler.replyToMessage')(
  function* (event: UserMessageCreated | MessageRetried) {
    const replies = yield* ReplyChatService
    return yield* replies.reply({
      userMessageId: event.messageId,
      chatId: event.chatId,
      userId: event.userId,
    })
  },
  Effect.catchTag('RunNotFoundError', () =>
    Effect.logInfo("reply skipped: no active Run for the event's message, chat and user"),
  ),
  // The Run holds these failures now, so the handling ends.
  Effect.catchTag(['RunStartedError', 'LlmError'], (error) => logFailed(Cause.fail(error))),
  // An interrupt skips every catch and tap, the consumer's log too; this handler still runs.
  Effect.onErrorIf(Cause.hasInterrupts, (cause) => logFailed(cause)),
  (reply, event) =>
    Effect.annotateLogs(reply, {
      messageId: event.messageId,
      chatId: event.chatId,
      userId: event.userId,
    }),
)

/**
 * Titles the user's chat from the event's first message; a message not found, a chat gone or
 * titled meanwhile, or an assistant error, is logged and skipped.
 */
export const titleChat = Effect.fn('ChatHandler.titleChat')(
  function* (event: ChatInitialized) {
    const titles = yield* TitleChatService
    return yield* titles.title({ id: event.messageId, chatId: event.chatId, userId: event.userId })
  },
  Effect.catchTags({
    LlmError: (error) =>
      Effect.logWarning('title skipped: the assistant failed', Cause.fail(error)),
    MessageNotFoundError: () => Effect.logInfo('title skipped: message not found'),
    ChatNotFoundError: () => Effect.logInfo('title skipped: chat deleted or titled'),
  }),
  (title, event) =>
    Effect.annotateLogs(title, {
      messageId: event.messageId,
      chatId: event.chatId,
      userId: event.userId,
    }),
)

/** The chat's events, each consumed from its queue by its handlers, keyed by the queue's name. */
export const ChatHandler = {
  [UserMessageCreated.queue.name]: consumeQueue(UserMessageCreated.queue, [replyToMessage]),
  [MessageRetried.queue.name]: consumeQueue(MessageRetried.queue, [replyToMessage]),
  [ChatInitialized.queue.name]: consumeQueue(ChatInitialized.queue, [titleChat]),
} satisfies Partial<Record<QueueName, (event: SqsEvent) => Effect.Effect<unknown, never, unknown>>>
