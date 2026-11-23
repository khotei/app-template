import { Array as Arr, Cause, Effect, Option, Schema } from 'effect'
import { Model } from 'effect/schema'

import { type MessageFields, NestedMessage } from '#chat/domain/message.model'
import {
  RunNotRetryableError,
  RunStartedError,
  RunStatusInvalidError,
} from '#chat/domain/run.error'
import {
  activeRunStatuses,
  type NestedRun,
  RunFields,
  type RunStatus,
} from '#chat/domain/run-fields.model'
import { hasStatus } from '#chat/domain/status.model'

/**
 * The work of answering one user message; a retry is a new Run of the same message. Read with
 * its messages, which its writes never touch.
 */
export class Run extends RunFields.extend<Run>('Run')({
  userMessage: Model.FieldOnly(['select', 'json'])(NestedMessage),
  /** The reply, none until the Run is done. */
  assistantMessage: Model.FieldOnly(['select', 'json'])(
    Schema.OptionFromNullOr(NestedMessage).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  ),
}) {}

export { activeRunStatuses }

export const isActiveRun = hasStatus(activeRunStatuses)

/** A Run past `queued` that has not ended. */
export const isStartedRun = hasStatus(['generating'])

/** A job refuses a Run some worker started (`RunStartedError`): that worker has died. */
export const ensureRunUnstarted = Effect.fnUntraced(function* (run: Run) {
  if (isStartedRun(run)) {
    return yield* new RunStartedError({ id: run.id })
  }
  return run
})

const isFailedRun = hasStatus(['failed'])

/**
 * A retry takes the chat's newest Run when it failed: only the newest user message ever gets a
 * Run, so the retry answers the chat's last user message.
 */
export const ensureRunRetryable = (newestRun: Option.Option<NestedRun>) =>
  newestRun.pipe(
    Option.filter<NestedRun>(isFailedRun),
    Effect.fromOption(() => new RunNotRetryableError()),
  )

/** Where a Run may move from each status; `done` and `failed` end it. */
const moveRunRules = {
  queued: ['generating', 'failed'],
  generating: ['done', 'failed'],
  done: [],
  failed: [],
} as const satisfies Record<RunStatus, ReadonlyArray<RunStatus>>

/** A move the table refuses dies: every caller moves a Run it has just read or moved. */
const ensureRunMove = Effect.fnUntraced(function* (run: Run, to: RunStatus) {
  if (!Arr.contains(moveRunRules[run.status], to)) {
    return yield* new RunStatusInvalidError({ id: run.id, from: run.status, to })
  }
}, Effect.orDie)

const move = Effect.fnUntraced(function* (
  run: Run,
  to: Exclude<RunStatus, 'queued'>,
  fields: Partial<Pick<Run, 'failure' | 'assistantMessageId' | 'assistantMessage'>> = {},
) {
  yield* ensureRunMove(run, to)
  return new Run({ ...run, ...fields, status: to })
})

export const startRun = Effect.fn('startRun')((run: Run) => move(run, 'generating'))

export const completeRun = Effect.fn('completeRun')((run: Run, reply: MessageFields) =>
  move(run, 'done', {
    assistantMessageId: Option.some(reply.id),
    assistantMessage: Option.some(reply),
  }),
)

/** Fails a Run with the full text of `cause`, its nested causes included. */
export const failRun = Effect.fn('failRun')((run: Run, cause: Cause.Cause<unknown>) =>
  move(run, 'failed', { failure: Option.some({ cause: Cause.pretty(cause) }) }),
)
