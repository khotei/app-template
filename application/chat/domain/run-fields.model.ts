import { Effect, Schema } from 'effect'

import { activeRunStatuses, runFailureReasons, runStatuses } from '@app-template/kernel/data'

import { ReplyProvenance } from '#chat/domain/assistant.port'
import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

export const ActiveRunStatus = RunStatus.pick(activeRunStatuses)
export type ActiveRunStatus = typeof ActiveRunStatus.Type

export const RunFailureReason = Schema.Literals(runFailureReasons)
export type RunFailureReason = typeof RunFailureReason.Type

export const RunFailure = Schema.Struct({
  reason: RunFailureReason,
  /** A user-facing sentence fixed per reason; it never quotes the cause. */
  message: Schema.String,
  /** Diagnostic detail for operators; it never leaves the api. */
  cause: Schema.String,
})
export type RunFailure = typeof RunFailure.Type

/** A Run's own fields: what a chat and a message nest of it. */
export const RunFields = Schema.Struct({
  id: RunId,
  chatId: ChatId,
  userMessageId: MessageId,
  status: RunStatus.pipe(Schema.withConstructorDefault(Effect.succeed('queued' as const))),
  failure: Schema.Option(RunFailure).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  provenance: ReplyProvenance,
  /** The reply's id, none until the Run is done. */
  assistantMessageId: Schema.Option(MessageId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
})
export type RunFields = typeof RunFields.Type
