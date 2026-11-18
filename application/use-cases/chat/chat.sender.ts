import { Cause, Context, DateTime, Effect, Layer } from 'effect'

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
import { type QueueError, QueueSender } from '@app-template/packages/queue'

export class AssistantMessageSender extends Context.Service<
  AssistantMessageSender,
  {
    /**
     * Sends the job that answers the Run; one SQS refuses fails the Run, so its message offers a
     * retry, and is `RunNotQueuedError`.
     */
    readonly send: (run: Run) => Effect.Effect<void, RunNotQueuedError>
  }
>()('@app-template/application/use-cases/chat/AssistantMessageSender', {
  make: Effect.gen(function* () {
    const queue = yield* QueueSender
    const runs = yield* RunRepository

    const failUnsent = Effect.fnUntraced(function* (run: Run, error: QueueError) {
      const at = yield* DateTime.now
      // The Run was stored queued a moment before, so a refused move is a defect.
      const failed = yield* failRun(run, {
        reason: 'ReplyFailed',
        cause: Cause.pretty(Cause.fail(error)),
        at,
      }).pipe(Effect.orDie)
      yield* encodeRowWith(RunFields)(failed).pipe(
        Effect.flatMap((row) => runs.update(row, { id: run.id, status: [run.status] })),
      )
      return yield* new RunNotQueuedError({ id: run.id })
    })

    const send = Effect.fn('AssistantMessageSender.send')((run: Run) =>
      queue.send(assistantMessageQueue, new GenerateAssistantMessage({ runId: run.id })).pipe(
        Effect.tapError((error) => Effect.logError('assistant message not queued', error)),
        Effect.catchTag('QueueError', (error) => failUnsent(run, error)),
        Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
      ),
    )

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
