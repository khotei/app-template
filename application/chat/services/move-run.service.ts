import { Cause, Context, Effect, Layer } from 'effect'

import type { MessageFields } from '#chat/domain/message.model'
import type { MessageId } from '#chat/domain/message.util'
import type { RunNotFoundError, RunStartedError } from '#chat/domain/run.error'
import {
  activeRunStatuses,
  completeRun,
  ensureRunUnstarted,
  failRun,
  generateRun,
  type Run,
} from '#chat/domain/run.model'
import { RunService } from '#chat/services/run.service'

/** Moves a Run by its model and writes it under the status it was read in. */
export class MoveRunService extends Context.Service<
  MoveRunService,
  {
    /**
     * Starts the active Run of the user's message `messageId` as it stands now, from `queued` to
     * `generating`; `RunStartedError` once some worker started it, `RunNotFoundError` when the
     * message has no active Run.
     */
    readonly start: (messageId: MessageId) => Effect.Effect<Run, RunNotFoundError | RunStartedError>
    /** Moves a generating Run to `done`, naming `reply`. */
    readonly complete: (run: Run, reply: MessageFields) => Effect.Effect<Run>
    /**
     * Moves the active Run `where` names, by its id or its user message, to `failed` as it stands
     * now, keeping the full text of `cause`; `RunNotFoundError` when none is active.
     */
    readonly fail: (
      where: Pick<Run, 'id'> | Pick<Run, 'userMessageId'>,
      cause: Cause.Cause<unknown>,
    ) => Effect.Effect<Run, RunNotFoundError>
  }
>()('@app-template/application/chat/services/MoveRunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunService

    function move(run: Run, moved: Effect.Effect<Run>) {
      return moved.pipe(
        Effect.flatMap((to) => runs.update(to, { id: run.id, status: [run.status] })),
      )
    }

    const start = Effect.fn('MoveRunService.start')(function* (messageId: MessageId) {
      const queued = yield* runs
        .getOne({ userMessageId: messageId, status: activeRunStatuses })
        .pipe(Effect.flatMap(ensureRunUnstarted))
      return yield* move(queued, generateRun(queued))
    })

    const complete = Effect.fn('MoveRunService.complete')((run: Run, reply: MessageFields) =>
      move(run, completeRun(run, reply)),
    )

    const fail = Effect.fn('MoveRunService.fail')(function* (
      where: Pick<Run, 'id'> | Pick<Run, 'userMessageId'>,
      cause: Cause.Cause<unknown>,
    ) {
      const active = yield* runs.getOne({ ...where, status: activeRunStatuses })
      return yield* move(active, failRun(active, { cause: Cause.pretty(cause) }))
    })

    return { start, complete, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
