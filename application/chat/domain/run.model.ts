import { type DateTime, Effect, Option, type Predicate, Schema, type Types } from 'effect'

import { activeRunStatuses } from '@app-template/kernel/data'

import type { AssistantError } from '#chat/domain/assistant.error'
import { ChatFields } from '#chat/domain/chat.model'
import { Message } from '#chat/domain/message.model'
import { RunStatusInvalidError } from '#chat/domain/run.error'
import {
  type RunFailure,
  type RunFailureReason,
  RunFields,
  type RunStatus,
} from '#chat/domain/run-fields.model'
import { hasStatus, isPreparing } from '#chat/domain/status.model'

/**
 * The work of answering one user message; a retry is a new Run of the same message. Read with
 * its chat and its messages; its writes never touch them.
 */
export class Run extends Schema.Class<Run>('Run')({
  ...RunFields.fields,
  chat: ChatFields,
  userMessage: Message,
  /** The reply, none until the Run is done. */
  assistantMessage: Schema.Option(Message).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
}) {}

export const buildRun = (
  fields: Types.Simplify<Pick<Run, 'id' | 'chat' | 'userMessage' | 'provenance' | 'createdAt'>>,
): Run =>
  new Run({
    ...fields,
    chatId: fields.chat.id,
    userMessageId: fields.userMessage.id,
    updatedAt: fields.createdAt,
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
    patch: { failure: Option.some({ reason, message: failureMessages[reason], cause }) },
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
