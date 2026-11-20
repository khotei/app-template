import { Array as Arr, Cause, Effect, Option, Schema } from 'effect'

import { activeRunStatuses } from '@app-template/kernel/data'

import { MessageFields } from '#chat/domain/message.model'
import { RunNotRetryableError, RunStatusInvalidError } from '#chat/domain/run.error'
import { type RunFailure, RunFields, type RunStatus } from '#chat/domain/run-fields.model'
import { hasStatus } from '#chat/domain/status.model'

/**
 * The work of answering one user message; a retry is a new Run of the same message. Read with
 * its messages, flat; its writes never touch them.
 */
export class Run extends Schema.Class<Run>('Run')({
  ...RunFields.fields,
  userMessage: MessageFields,
  /** The reply, none until the Run is done. */
  assistantMessage: Schema.OptionFromNullOr(MessageFields).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
}) {}

export const isActiveRun = hasStatus(activeRunStatuses)

/** A Run past `queued` that has not ended. */
export const isStartedRun = hasStatus(['preparing', 'generating'])

const isFailedRun = hasStatus(['failed'])

/**
 * A retry takes the chat's newest Run when it failed: only the newest user message ever gets a
 * Run, so the retry answers the chat's last user message.
 */
export const ensureRunRetryable = (latestRun: Option.Option<RunFields>) =>
  latestRun.pipe(
    Option.filter<RunFields>(isFailedRun),
    Option.match({
      onNone: () => Effect.fail(new RunNotRetryableError()),
      onSome: Effect.succeed,
    }),
  )

/** Where a Run may move from each status; `done` and `failed` end it. */
const moveRunRules: Record<RunStatus, ReadonlyArray<RunStatus>> = {
  queued: ['preparing', 'failed'],
  preparing: ['generating', 'failed'],
  generating: ['done', 'failed'],
  done: [],
  failed: [],
}

const ensureRunMove = Effect.fnUntraced(function* (run: Run, to: RunStatus) {
  if (!Arr.contains(moveRunRules[run.status], to)) {
    return yield* new RunStatusInvalidError({ id: run.id, from: run.status, to })
  }
})

const move = Effect.fnUntraced(function* (
  run: Run,
  to: Exclude<RunStatus, 'queued'>,
  fields: Partial<Pick<Run, 'failure' | 'assistantMessageId' | 'assistantMessage'>> = {},
) {
  yield* ensureRunMove(run, to)
  return new Run({ ...run, ...fields, status: to })
})

export const prepareRun = Effect.fn('prepareRun')((run: Run) => move(run, 'preparing'))

export const generateRun = Effect.fn('generateRun')((run: Run) => move(run, 'generating'))

export const completeRun = Effect.fn('completeRun')((run: Run, reply: MessageFields) =>
  move(run, 'done', {
    assistantMessageId: Option.some(reply.id),
    assistantMessage: Option.some(reply),
  }),
)

export const failRun = Effect.fn('failRun')((run: Run, failure: RunFailure) =>
  move(run, 'failed', { failure: Option.some(failure) }),
)

/** The reason of a Run that ended with no error to name it: a defect, an interrupt, a dead worker. */
export const abortedRunReason = 'RunAborted'

/** The failure a cause ends a Run with: the tag of the error it holds, and its full text. */
export function buildRunFailure(cause: Cause.Cause<{ readonly _tag: string }>): RunFailure {
  const reason = Cause.findErrorOption(cause).pipe(
    Option.match({ onNone: () => abortedRunReason, onSome: ({ _tag }) => _tag }),
  )
  return { reason, cause: Cause.pretty(cause) }
}
