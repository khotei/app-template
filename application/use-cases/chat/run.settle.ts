import { Cause, Effect } from 'effect'

import { failRun, type Run, RunService } from '@app-template/application/chat'
import type { QueueError } from '@app-template/packages/queue'

const failRefused = Effect.fnUntraced(function* (run: Run, refused: QueueError) {
  const runs = yield* RunService
  const cause = Cause.pretty(Cause.fail(refused))

  // The Run was stored queued a moment before, so a refused move is a defect.
  return yield* failRun(run, { reason: refused._tag, cause }).pipe(
    Effect.orDie,
    Effect.flatMap((failed) => runs.update(failed, { id: run.id, status: [run.status] })),
  )
})

/**
 * Succeeds with the Run once its job's `send` does; a send SQS refuses is logged and fails the Run
 * with the queue's error as its reason and cause, and the failed Run is the result.
 */
export function failUnsentRun(run: Run) {
  return <R>(send: Effect.Effect<void, QueueError, R>) =>
    send.pipe(
      Effect.as(run),
      Effect.tapError((error) => Effect.logError('assistant message not queued', error)),
      Effect.catchTag('QueueError', (refused) => failRefused(run, refused)),
      Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
    )
}
