import { type DateTime, Effect, Option, type Predicate, Schema, type Types } from 'effect'

import { activeRunStatuses, runFailureReasons, runStatuses } from '@app-template/kernel/data'

import type { AssistantError } from '#chat/domain/assistant.error'
import { ReplyProvenance } from '#chat/domain/assistant.port'
import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Message } from '#chat/domain/message.model'
import { RunStatusInvalidError } from '#chat/domain/run.error'
import { hasStatus, isPreparing, Status } from '#chat/domain/status.model'

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
  /** The reply's id, none until the Run is done. */
  assistantMessageId: Schema.Option(MessageId),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  /** Read with the Run; its writes never touch the messages. */
  userMessage: Message,
  /** The reply, none until the Run is done. */
  assistantMessage: Schema.Option(Message),
}) {}

export const buildRun = (
  fields: Types.Simplify<Pick<Run, 'id' | 'chatId' | 'userMessage' | 'provenance' | 'createdAt'>>,
): Run =>
  new Run({
    ...fields,
    userMessageId: fields.userMessage.id,
    status: 'queued',
    failure: Option.none(),
    assistantMessageId: Option.none(),
    updatedAt: fields.createdAt,
    assistantMessage: Option.none(),
  })

export const isActiveRun = hasStatus(activeRunStatuses)

/** A Run some worker already took: found at a worker's start, the worker that took it has died. */
export const isStartedRun = hasStatus(['preparing', 'generating'])

/** Which Runs may enter each status; `queued` is only ever built, never entered. */
const transitions = {
  preparing: isActiveRun,
  generating: isPreparing,
  done: isActiveRun,
  failed: isActiveRun,
} as const satisfies Record<Exclude<RunStatus, 'queued'>, Predicate.Predicate<Run>>

const move = Effect.fnUntraced(function* (
  run: Run,
  {
    to,
    at,
    patch,
  }: {
    readonly to: keyof typeof transitions
    readonly at: DateTime.Utc
    readonly patch?: Partial<Pick<Run, 'failure' | 'assistantMessageId' | 'assistantMessage'>>
  },
) {
  if (!transitions[to](run)) {
    return yield* new RunStatusInvalidError({ id: run.id, from: run.status, to })
  }
  return new Run({ ...run, ...patch, status: to, updatedAt: at })
})

export const prepareRun = Effect.fn('prepareRun')((run: Run, at: DateTime.Utc) =>
  move(run, { to: 'preparing', at }),
)

export const generateRun = Effect.fn('generateRun')((run: Run, at: DateTime.Utc) =>
  move(run, { to: 'generating', at }),
)

/** The reply a Run settled with and when. */
export type RunCompletion = { readonly reply: Message; readonly at: DateTime.Utc }

export const completeRun = Effect.fn('completeRun')((run: Run, { reply, at }: RunCompletion) =>
  move(run, {
    to: 'done',
    at,
    patch: { assistantMessageId: Option.some(reply.id), assistantMessage: Option.some(reply) },
  }),
)

const failureMessages = {
  ReplyFailed: 'The assistant could not reply. Please try again.',
  ReplyRefused: 'The assistant declined to answer this message.',
} as const satisfies Record<RunFailureReason, string>

/** Why a Run failed and when; the user-facing text comes from `failureMessages`. */
export type RunFailureInput = Types.Simplify<
  Pick<RunFailure, 'reason' | 'cause'> & { readonly at: DateTime.Utc }
>

export const failRun = Effect.fn('failRun')((run: Run, { reason, cause, at }: RunFailureInput) =>
  move(run, {
    to: 'failed',
    at,
    patch: {
      failure: Option.some(new RunFailure({ reason, message: failureMessages[reason], cause })),
    },
  }),
)

const failureReasons = {
  AssistantRefusedError: 'ReplyRefused',
  AssistantFailedError: 'ReplyFailed',
} as const satisfies Record<AssistantError['_tag'], RunFailureReason>

export const buildRunFailure = (
  error: AssistantError,
): Types.Simplify<Pick<RunFailure, 'reason' | 'cause'>> => ({
  reason: failureReasons[error._tag],
  cause: error.cause,
})
