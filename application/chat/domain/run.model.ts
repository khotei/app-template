import { Array as Arr, Cause, Effect, Option, Schema } from 'effect'

import { activeRunStatuses } from '@app-template/kernel/data'

import type { MessageId } from '#chat/domain/message.util'
import {
  RunNotRetryableError,
  RunStartedError,
  RunStatusInvalidError,
} from '#chat/domain/run.error'
import { RunFields, type RunStatus } from '#chat/domain/run-fields.model'
import { hasStatus } from '#chat/domain/status.model'

/**
 * The work of answering one user message, as its row holds it: `userMessageId` names the message
 * it answers, `assistantMessageId` its reply. A retry is a new Run of the same message.
 */
export class Run extends Schema.Class<Run>('Run')(RunFields.fields) {}

// The statuses the data layer's active index holds, served through the module's entry.
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
export const ensureRunRetryable = (newestRun: Option.Option<RunFields>) =>
  newestRun.pipe(
    Option.filter<RunFields>(isFailedRun),
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
  fields: Partial<Pick<Run, 'failure' | 'assistantMessageId'>> = {},
) {
  yield* ensureRunMove(run, to)
  return new Run({ ...run, ...fields, status: to })
})

export const startRun = Effect.fn('startRun')((run: Run) => move(run, 'generating'))

/** Ends a Run with the reply `replyId` names. */
export const completeRun = Effect.fn('completeRun')((run: Run, replyId: MessageId) =>
  move(run, 'done', { assistantMessageId: Option.some(replyId) }),
)

/** Fails a Run with the full text of `cause`, its nested causes included. */
export const failRun = Effect.fn('failRun')((run: Run, cause: Cause.Cause<unknown>) =>
  move(run, 'failed', { failure: Option.some({ cause: Cause.pretty(cause) }) }),
)
