import { Cause, Context, Effect, Layer } from 'effect'

import type { Run } from '#chat/domain/run.model'
import { sendGenerateAssistantMessage } from '#chat/infrastructure/chat.queue'
import { MoveRunService } from '#chat/services/move-run.service'

/**
 * The queue's sender, which a service never names: the process provides it to the caller, so
 * every test layer of the module builds without one.
 */
type Sending = Effect.Services<ReturnType<typeof sendGenerateAssistantMessage>>

/** Sends a Run's job, after the commit of the Run it names, and settles SQS's refusal on it. */
export class JobRunService extends Context.Service<
  JobRunService,
  {
    /** Answers the Run sent, or failed with the full text of SQS's refusal. */
    readonly send: (run: Run) => Effect.Effect<Run, never, Sending>
  }
>()('@app-template/application/chat/services/JobRunService', {
  make: Effect.gen(function* () {
    const moves = yield* MoveRunService

    const send = Effect.fn('JobRunService.send')((run: Run) =>
      sendGenerateAssistantMessage(run).pipe(
        Effect.as(run),
        Effect.catch((error) => moves.fail(run.id, Cause.fail(error))),
        // The Run was stored queued a moment before, so a Run gone or a refused move is a defect.
        Effect.orDie,
        // A client's abort mid-send still leaves the Run sent or failed.
        Effect.uninterruptible,
      ),
    )

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
