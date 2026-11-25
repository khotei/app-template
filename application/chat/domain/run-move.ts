import { Array as Arr, Cause, Effect, Option, type Types } from 'effect'

import type { MessageId } from '#chat/domain/message.util'
import { Run, type RunFields, type RunStatus, RunStatusInvalidError } from '#chat/domain/run.model'

/** Where a Run may move from each status; `done` and `failed` end it. */
const moveRunRules = {
  queued: ['generating', 'failed'],
  generating: ['done', 'failed'],
  done: [],
  failed: [],
} as const satisfies Record<RunStatus, ReadonlyArray<RunStatus>>

/** A move the table refuses dies: every caller moves a Run it has just read or moved. */
const ensureRunMove = Effect.fnUntraced(function* (
  run: Types.Simplify<Pick<Run, 'id' | 'status'>>,
  to: RunStatus,
) {
  if (!Arr.contains(moveRunRules[run.status], to)) {
    return yield* new RunStatusInvalidError({ id: run.id, from: run.status, to })
  }
}, Effect.orDie)

const move = Effect.fnUntraced(function* (
  run: RunFields,
  to: Exclude<RunStatus, 'queued'>,
  fields: Partial<Pick<Run, 'failure' | 'assistantMessageId'>> = {},
) {
  yield* ensureRunMove(run, to)
  return new Run({ ...run, ...fields, status: to })
})

/** A Run's status moves, each returning the Run it makes, named for the move, not the status. */
export class RunMove {
  static readonly start = Effect.fn('RunMove.start')((run: RunFields) => move(run, 'generating'))

  /** Ends a Run with the reply `replyId` names. */
  static readonly complete = Effect.fn('RunMove.complete')((run: RunFields, replyId: MessageId) =>
    move(run, 'done', { assistantMessageId: Option.some(replyId) }),
  )

  /** Fails a Run with the full text of `cause`, its nested causes included. */
  static readonly fail = Effect.fn('RunMove.fail')((run: RunFields, cause: Cause.Cause<unknown>) =>
    move(run, 'failed', { failure: Option.some({ cause: Cause.pretty(cause) }) }),
  )
}
