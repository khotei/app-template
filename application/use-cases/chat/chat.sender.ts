import { Effect } from 'effect'

import {
  assistantMessageQueue,
  failRun,
  GenerateAssistantMessage,
  type Run,
  RunNotQueuedError,
  RunService,
} from '@app-template/application/chat'
import { QueueSender } from '@app-template/packages/queue'

const failUnsent = Effect.fnUntraced(function* (run: Run) {
  const runs = yield* RunService
  // The Run was stored queued a moment before, so a refused move is a defect.
  yield* runs
    .move(run, (queued, at) => failRun(queued, { reason: 'ReplyFailed', at }))
    .pipe(Effect.orDie)
  return yield* new RunNotQueuedError({ id: run.id })
})

/**
 * Sends the job that answers the Run; one SQS refuses fails the Run, so its message offers a
 * retry, and is `RunNotQueuedError`.
 */
export const sendGenerateAssistantMessage = Effect.fn('sendGenerateAssistantMessage')((run: Run) =>
  QueueSender.use((queue) =>
    queue.send(assistantMessageQueue, new GenerateAssistantMessage({ runId: run.id })),
  ).pipe(
    Effect.tapError((error) => Effect.logError('assistant message not queued', error)),
    Effect.catchTag('QueueError', () => failUnsent(run)),
    Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
  ),
)
