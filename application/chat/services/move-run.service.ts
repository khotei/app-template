import { Cause, Context, Effect, Layer } from 'effect'

import type { MessageFields } from '#chat/domain/message.model'
import type { MessageId } from '#chat/domain/message.util'
import type { ActiveRunNotFoundError, RunStartedError } from '#chat/domain/run.error'
import {
  completeRun,
  ensureRunUnstarted,
  failRun,
  type Run,
  startRun,
} from '#chat/domain/run.model'
import { RunService } from '#chat/services/run.service'

/** Moves a Run under the status it was read in. */
export class MoveRunService extends Context.Service<
  MoveRunService,
  {
    /**
     * Starts the active Run of the user's message `userMessageId` as it stands now, from `queued`
     * to `generating`; `RunStartedError` once some worker started it.
     */
    readonly start: (
      userMessageId: MessageId,
    ) => Effect.Effect<Run, ActiveRunNotFoundError | RunStartedError>
    /** Moves a generating Run to `done`, naming `reply`. */
    readonly complete: (run: Run, reply: MessageFields) => Effect.Effect<Run>
    /** Moves `run` to `failed`, keeping the full text of `cause`. */
    readonly fail: (run: Run, cause: Cause.Cause<unknown>) => Effect.Effect<Run>
    /**
     * Fails the active Run of the user's message `userMessageId` as it stands now, keeping the
     * full text of `cause`.
     */
    readonly failActive: (
      userMessageId: MessageId,
      cause: Cause.Cause<unknown>,
    ) => Effect.Effect<Run, ActiveRunNotFoundError>
  }
>()('@app-template/application/chat/services/MoveRunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunService

    function move(run: Run, moved: Effect.Effect<Run>) {
      return moved.pipe(
        Effect.flatMap((to) => runs.update(to, { id: run.id, status: [run.status] })),
      )
    }

    const start = Effect.fn('MoveRunService.start')(function* (userMessageId: MessageId) {
      const queued = yield* runs.getActive(userMessageId).pipe(Effect.flatMap(ensureRunUnstarted))
      return yield* move(queued, startRun(queued))
    })

    const complete = Effect.fn('MoveRunService.complete')((run: Run, reply: MessageFields) =>
      move(run, completeRun(run, reply)),
    )

    const fail = Effect.fn('MoveRunService.fail')((run: Run, cause: Cause.Cause<unknown>) =>
      move(run, failRun(run, { cause: Cause.pretty(cause) })),
    )

    const failActive = Effect.fn('MoveRunService.failActive')(function* (
      userMessageId: MessageId,
      cause: Cause.Cause<unknown>,
    ) {
      const active = yield* runs.getActive(userMessageId)
      return yield* fail(active, cause)
    })

    return { start, complete, fail, failActive }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
