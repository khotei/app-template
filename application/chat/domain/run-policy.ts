import { Effect, Option, type Types } from 'effect'

import { type Run, RunNotRetryableError, RunStartedError } from '#chat/domain/run.model'
import { RunState } from '#chat/domain/run-state'

/** The checks a Run passes before a move; each fails or hands its Run back. */
export class RunPolicy {
  /** A reply refuses a Run some worker started (`RunStartedError`): that worker has died. */
  static readonly ensureUnstarted = Effect.fnUntraced(function* <
    R extends Types.Simplify<Pick<Run, 'id' | 'status'>>,
  >(run: R) {
    if (RunState.isStarted(run)) {
      return yield* new RunStartedError({ id: run.id })
    }
    return run
  })

  /**
   * A retry takes the chat's newest Run when it failed: only the newest user message ever gets a
   * Run, so the retry answers the chat's last user message.
   */
  static readonly ensureRetryable = Effect.fnUntraced(function* <
    R extends Types.Simplify<Pick<Run, 'status'>>,
  >(newestRun: Option.Option<R>) {
    const failed = Option.filter<R>(newestRun, RunState.isFailed)
    if (Option.isNone(failed)) return yield* new RunNotRetryableError()
    return failed.value
  })
}
