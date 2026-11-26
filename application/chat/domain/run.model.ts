import { Data, Effect, Schema } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '@app-template/application/user/contract'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'

/** `queued` until a worker starts it, `generating` while it works, `done` or `failed` at its end. */
export const RunStatus = Schema.Literals(['queued', 'generating', 'done', 'failed'])
export type RunStatus = typeof RunStatus.Type

/** Why a Run failed: the full text of what ended it, for operators; no wire shape holds it. */
export const RunFailure = Schema.Struct({ cause: Schema.String })
export type RunFailure = typeof RunFailure.Type

export class RunStatusInvalidError extends Data.TaggedError('RunStatusInvalidError')<{
  readonly id: RunId
  readonly from: RunStatus
  readonly to: RunStatus
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
}) {}

/** A Run's fields: what a move takes, a Run, a spread Run or another shape's. */
export type RunFields = Schema.Struct.Type<typeof Run.fields>

/** The statuses of a Run still in flight. */
export const activeRunStatuses = [
  'queued',
  'generating',
] as const satisfies ReadonlyArray<RunStatus>
