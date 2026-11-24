import { Array as Arr, Cause, DateTime, Effect, Option, Schema } from 'effect'

import { activeRunStatuses, RunFailure, runStatuses } from '@app-template/kernel/data'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import {
  RunNotRetryableError,
  RunStartedError,
  RunStatusInvalidError,
} from '#chat/domain/run.error'
import { RunId } from '#chat/domain/run.util'
import { hasStatus, Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

// The column's shape is the model's own: one definition, served through the module's entry.
export { RunFailure }

/**
 * The work of answering one user message, as its row holds it: `userMessageId` names the message
 * it answers, `assistantMessageId` its reply. A retry is a new Run of the same message. A chat
 * and a message nest it whole. `makeEffect` stamps a timestamp left out with the clock's now.
 */
export class Run extends Schema.Class<Run>('Run')({
  id: RunId,
  chatId: ChatId,
  userMessageId: MessageId,
  status: RunStatus.pipe(Schema.withConstructorDefault(Effect.succeed('queued' as const))),
  failure: Schema.OptionFromNullOr(RunFailure).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  /** The reply's id, none until the Run is done. */
  assistantMessageId: Schema.OptionFromNullOr(MessageId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  createdAt: Schema.DateTimeUtcFromDate.pipe(Schema.withConstructorDefault(DateTime.now)),
  updatedAt: Schema.DateTimeUtcFromDate.pipe(Schema.withConstructorDefault(DateTime.now)),
}) {}

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
export const ensureRunRetryable = (newestRun: Option.Option<Run>) =>
  newestRun.pipe(
    Option.filter<Run>(isFailedRun),
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
