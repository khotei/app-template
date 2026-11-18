import { DateTime, Effect } from 'effect'

import {
  assistantMessageQueue,
  failRun,
  GenerateAssistantMessage,
  type Run,
  RunFields,
  RunNotQueuedError,
} from '@app-template/application/chat'
import { RunRepository } from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { QueueSender } from '@app-template/packages/queue'

const failUnsent = Effect.fnUntraced(function* (run: Run) {
  const runs = yield* RunRepository
  const at = yield* DateTime.now
  // The Run was stored queued a moment before, so a refused move is a defect.
  const failed = yield* failRun(run, { reason: 'ReplyFailed', at }).pipe(Effect.orDie)
  yield* encodeRowWith(RunFields)(failed).pipe(
    Effect.flatMap((row) => runs.update(row, { id: run.id, status: [run.status] })),
  )
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
