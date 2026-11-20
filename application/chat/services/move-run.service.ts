import { Cause, Context, Effect, Layer } from 'effect'

import type { MessageFields } from '#chat/domain/message.model'
import type { RunNotFoundError, RunStartedError } from '#chat/domain/run.error'
import {
  activeRunStatuses,
  completeRun,
  ensureRunUnstarted,
  failRun,
  generateRun,
  prepareRun,
  type Run,
} from '#chat/domain/run.model'
import type { RunId } from '#chat/domain/run.util'
import { RunService } from '#chat/services/run.service'

/** Moves a Run by its model and writes it under the status it was read in. */
export class MoveRunService extends Context.Service<
  MoveRunService,
  {
    /**
     * Moves the Run `id` from `queued` to `preparing` as it stands now; `RunStartedError` once
     * some worker started it, `RunNotFoundError` once it is settled or gone.
     */
    readonly prepare: (id: RunId) => Effect.Effect<Run, RunNotFoundError | RunStartedError>
    /** Moves a preparing Run to `generating`. */
    readonly generate: (run: Run) => Effect.Effect<Run>
    /** Moves a generating Run to `done`, naming `reply`. */
    readonly complete: (run: Run, reply: MessageFields) => Effect.Effect<Run>
    /**
     * Moves the Run `id` to `failed` as it stands now, keeping the full text of `cause`;
     * `RunNotFoundError` once it is settled or gone.
     */
    readonly fail: (id: RunId, cause: Cause.Cause<unknown>) => Effect.Effect<Run, RunNotFoundError>
  }
>()('@app-template/application/chat/services/MoveRunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunService

    function move(run: Run, moved: Effect.Effect<Run>) {
      return moved.pipe(
        Effect.flatMap((to) => runs.update(to, { id: run.id, status: [run.status] })),
      )
    }

    const prepare = Effect.fn('MoveRunService.prepare')(function* (id: RunId) {
      const queued = yield* runs
        .getOne({ id, status: activeRunStatuses })
        .pipe(Effect.flatMap(ensureRunUnstarted))
      return yield* move(queued, prepareRun(queued))
    })

    const generate = Effect.fn('MoveRunService.generate')((run: Run) => move(run, generateRun(run)))

    const complete = Effect.fn('MoveRunService.complete')((run: Run, reply: MessageFields) =>
      move(run, completeRun(run, reply)),
    )

    const fail = Effect.fn('MoveRunService.fail')(function* (
      id: RunId,
      cause: Cause.Cause<unknown>,
    ) {
      const active = yield* runs.getOne({ id, status: activeRunStatuses })
      return yield* move(active, failRun(active, { cause: Cause.pretty(cause) }))
    })

    return { prepare, generate, complete, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
