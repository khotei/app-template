import { Array as Arr, Cause, Data, Effect, Option, Schema, type Types } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '@app-template/application/identity'
import { decodeWith, makeRowWith, makeUpdateWith } from '@app-template/packages/schema'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
import { hasStatus, Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(['queued', 'generating', 'done', 'failed'])
export type RunStatus = typeof RunStatus.Type

/** Why a Run failed: the full text of what ended it, for operators; no wire shape holds it. */
export const RunFailure = Schema.Struct({ cause: Schema.String })
export type RunFailure = typeof RunFailure.Type

export class RunStatusInvalidError extends Data.TaggedError('RunStatusInvalidError')<{
  readonly id: RunId
  readonly from: Status
  readonly to: Status
}> {}

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()(
  'RunNotFoundError',
  {
    where: Schema.Union([
      Schema.Struct({ id: RunId }),
      Schema.Struct({ userMessageId: MessageId }),
    ]),
  },
  { httpApiStatus: 404 },
) {}

export class RunStartedError extends Data.TaggedError('RunStartedError')<{
  readonly id: RunId
}> {
  override get message() {
    return 'the worker that started the Run stopped before it ended'
  }
}

export class RunNotRetryableError extends Schema.TaggedError<RunNotRetryableError>()(
  'RunNotRetryableError',
  {},
  { httpApiStatus: 409 },
) {}

/**
 * The work of answering one user message, as `runs` holds it: `userMessageId` names the message
 * it answers, `assistantMessageId` its reply. A retry is a new Run of the same message. An update
 * writes its status, failure, reply and `updatedAt`; no json variant holds `failure`, so the
 * provider's text never reaches the wire.
 */
export class Run extends Model.Class<Run>('Run')({
  id: Model.UuidV7Insert(RunId),
  chatId: ChatId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  /** The owner of the Run's chat. */
  userId: UserId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  userMessageId: MessageId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  status: RunStatus.pipe(Schema.withConstructorDefault(Effect.succeed('queued' as const))),
  failure: Schema.OptionFromNullOr(RunFailure).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
    Model.Sensitive,
  ),
  /** The reply's id, none until the Run is done. */
  assistantMessageId: Schema.OptionFromNullOr(MessageId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
}) {
  static readonly decodeOne = decodeWith(Schema.Option(this))
  static readonly makeInsert = makeRowWith(this.insert)
  static readonly makeUpdate = makeUpdateWith(this.update)

  ensureUnstarted() {
    return ensureRunUnstarted(this)
  }

  start() {
    return startRun(this)
  }

  complete(replyId: MessageId) {
    return completeRun(this, replyId)
  }

  fail(cause: Cause.Cause<unknown>) {
    return failRun(this, cause)
  }
}

/** A Run's fields without its members: what a move takes, a spread Run or another shape's. */
export type RunFields = Schema.Struct.Type<typeof Run.fields>

/** The statuses of a Run still in flight. */
export const activeRunStatuses = [
  'queued',
  'generating',
] as const satisfies ReadonlyArray<RunStatus>

export const isActiveRun = hasStatus(activeRunStatuses)

/** A Run past `queued` that has not ended. */
export const isStartedRun = hasStatus(['generating'])

/** A job refuses a Run some worker started (`RunStartedError`): that worker has died. */
export const ensureRunUnstarted = Effect.fnUntraced(function* <
  R extends Types.Simplify<Pick<Run, 'id' | 'status'>>,
>(run: R) {
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
export const ensureRunRetryable = Effect.fnUntraced(function* <
  R extends Types.Simplify<Pick<Run, 'status'>>,
>(newestRun: Option.Option<R>) {
  const failed = Option.filter<R>(newestRun, isFailedRun)
  if (Option.isNone(failed)) return yield* new RunNotRetryableError()
  return failed.value
})

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

export const startRun = Effect.fn('startRun')((run: RunFields) => move(run, 'generating'))

/** Ends a Run with the reply `replyId` names. */
export const completeRun = Effect.fn('completeRun')((run: RunFields, replyId: MessageId) =>
  move(run, 'done', { assistantMessageId: Option.some(replyId) }),
)

/** Fails a Run with the full text of `cause`, its nested causes included. */
export const failRun = Effect.fn('failRun')((run: RunFields, cause: Cause.Cause<unknown>) =>
  move(run, 'failed', { failure: Option.some({ cause: Cause.pretty(cause) }) }),
)
