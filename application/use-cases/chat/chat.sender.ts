import { Cause, Effect } from 'effect'

import {
  assistantMessageQueue,
  chatTitleQueue,
  failRun,
  GenerateAssistantMessage,
  GenerateChatTitle,
  type MessageFields,
  type Run,
  RunNotQueuedError,
  RunService,
} from '@app-template/application/chat'
import { type QueueError, QueueSender } from '@app-template/packages/queue'

const failUnsent = Effect.fnUntraced(function* (run: Run, refused: QueueError) {
  const runs = yield* RunService
  const error = new RunNotQueuedError({ id: run.id, cause: refused })
  const cause = Cause.pretty(Cause.fail(refused))

  // The Run was stored queued a moment before, so a refused move is a defect.
  yield* runs
    .move(run, (queued, at) => failRun(queued, { reason: error._tag, cause, at }))
    .pipe(Effect.orDie)
  return yield* error
})

/**
 * Sends the job that answers the Run; one SQS refuses fails the Run with the refusal as its
 * cause, and is `RunNotQueuedError` carrying it.
 */
export const sendGenerateAssistantMessage = Effect.fn('sendGenerateAssistantMessage')((run: Run) =>
  QueueSender.use((queue) =>
    queue.send(assistantMessageQueue, new GenerateAssistantMessage({ runId: run.id })),
  ).pipe(
    Effect.tapError((error) => Effect.logError('assistant message not queued', error)),
    Effect.catchTag('QueueError', (refused) => failUnsent(run, refused)),
    Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
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
