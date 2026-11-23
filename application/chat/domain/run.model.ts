import { Array as Arr, Cause, Effect, Option, Schema } from 'effect'
import { Model } from 'effect/schema'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import {
  RunNotRetryableError,
  RunStartedError,
  RunStatusInvalidError,
} from '#chat/domain/run.error'
import { RunId } from '#chat/domain/run.util'
import { hasStatus, Status } from '#chat/domain/status.model'

export const runStatuses = ['queued', 'generating', 'done', 'failed'] as const

/** The statuses of a Run still in flight; `runs_chat_id_active_index` allows one per chat. */
export const activeRunStatuses = ['queued', 'generating'] as const

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

/** Why a Run failed: the full text of what ended it, for operators. */
export const RunFailure = Schema.Struct({ cause: Schema.String })
export type RunFailure = typeof RunFailure.Type

/** Written once, by the insert. */
const insertOnly = Model.FieldExcept(['update', 'jsonUpdate'])

/**
 * The work of answering one user message, as `runs` holds it; a retry is a new Run of the same
 * message. An update writes its status, failure, reply and `updatedAt`.
 */
export class Run extends Model.Class<Run>('Run')({
  id: Model.UuidV7Insert(RunId),
  chatId: insertOnly(ChatId),
  userMessageId: insertOnly(MessageId),
  status: RunStatus.pipe(Schema.withConstructorDefault(Effect.succeed('queued' as const))),
  // `jsonb` is written as JSON text, as `@effect/sql-pg` binds no object, and read back parsed;
  // no json variant, so the provider's text never reaches the wire.
  failure: Model.Field({
    select: Schema.OptionFromNullOr(RunFailure).pipe(
      Schema.withConstructorDefault(Effect.succeedNone),
    ),
    insert: Schema.OptionFromNullOr(Schema.fromJsonString(RunFailure)).pipe(
      Schema.withConstructorDefault(Effect.succeedNone),
    ),
    update: Schema.OptionFromNullOr(Schema.fromJsonString(RunFailure)),
  }),
  /** The reply's id, none until the Run is done. */
  assistantMessageId: Schema.OptionFromNullOr(MessageId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
}) {}

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
 * A retry takes the chat's newest Run, as a chat nests it, when it failed: only the newest user
 * message ever gets a Run, so the retry answers the chat's last user message.
 */
export const ensureRunRetryable = (newestRun: Option.Option<typeof Run.json.Type>) =>
  newestRun.pipe(
    Option.filter<typeof Run.json.Type>(isFailedRun),
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
