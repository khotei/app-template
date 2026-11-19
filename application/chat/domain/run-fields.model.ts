import { Effect, Schema } from 'effect'

import { runStatuses } from '@app-template/kernel/data'

import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

export const RunFailure = Schema.Struct({
  /** The tag of the failure that ended the Run, an open set. */
  reason: Schema.NonEmptyString,
  /** A user-facing sentence chosen by the reason; it never quotes the cause. */
  message: Schema.String,
})
export type RunFailure = typeof RunFailure.Type

/** A Run's own fields: what a chat and a message nest of it. */
export const RunFields = Schema.Struct({
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
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
})
export type RunFields = typeof RunFields.Type
