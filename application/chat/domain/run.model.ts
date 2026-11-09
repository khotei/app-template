import { type DateTime, Effect, type Predicate, Schema, type Types } from 'effect'

import { activeRunStatuses, runFailureReasons, runStatuses } from '@app-template/kernel/data'

import { ReplyProvenance } from '#chat/domain/assistant.port'
import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import type { RunStatusInvalidError } from '#chat/domain/run.error'
import { Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

export const ActiveRunStatus = RunStatus.pick(activeRunStatuses)
export type ActiveRunStatus = typeof ActiveRunStatus.Type

export const RunFailureReason = Schema.Literals(runFailureReasons)
export type RunFailureReason = typeof RunFailureReason.Type

export class RunFailure extends Schema.Class<RunFailure>('RunFailure')({
  reason: RunFailureReason,
  /** A user-facing sentence fixed per reason; it never quotes the cause. */
  message: Schema.String,
  /** Diagnostic detail for operators; it never leaves the api. */
  cause: Schema.String,
}) {}

/** The work of answering one user message; a retry is a new Run of the same message. */
export class Run extends Schema.Class<Run>('Run')({
  id: RunId,
  chatId: ChatId,
  userMessageId: MessageId,
  status: RunStatus,
  failure: Schema.Option(RunFailure),
  provenance: ReplyProvenance,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

export const buildRun = (
  _fields: Types.Simplify<
    Pick<Run, 'id' | 'chatId' | 'userMessageId' | 'provenance' | 'createdAt'>
  >,
): Run => {
  throw new Error('todo')
}

export const isActiveRun: Predicate.Predicate<Run> = () => {
  throw new Error('todo')
}

/** A Run some worker already took: found at a worker's start, the worker that took it has died. */
export const isStartedRun: Predicate.Predicate<Run> = () => {
  throw new Error('todo')
}

export const prepareRun = (
  _run: Run,
  _at: DateTime.Utc,
): Effect.Effect<Run, RunStatusInvalidError> => Effect.die('todo')

export const generateRun = (
  _run: Run,
  _at: DateTime.Utc,
): Effect.Effect<Run, RunStatusInvalidError> => Effect.die('todo')

export const completeRun = (
  _run: Run,
  _at: DateTime.Utc,
): Effect.Effect<Run, RunStatusInvalidError> => Effect.die('todo')

/** Why a Run failed and when; the user-facing text is fixed per reason. */
export type RunFailureInput = Types.Simplify<
  Pick<RunFailure, 'reason' | 'cause'> & { readonly at: DateTime.Utc }
>

export const failRun = (
  _run: Run,
  _input: RunFailureInput,
): Effect.Effect<Run, RunStatusInvalidError> => Effect.die('todo')
