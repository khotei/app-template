import { type DateTime, Effect, Option, type Predicate, Schema, type Types } from 'effect'

import { activeRunStatuses } from '@app-template/kernel/data'

import type { ChatId } from '#chat/domain/chat.util'
import { MessageFields } from '#chat/domain/message.model'
import { RunNotRetryableError, RunStatusInvalidError } from '#chat/domain/run.error'
import { type RunFailure, RunFields, type RunStatus } from '#chat/domain/run-fields.model'
import { hasStatus, isPreparing } from '#chat/domain/status.model'

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

export const buildRun = (
  fields: Types.Simplify<Pick<Run, 'id' | 'chatId' | 'userMessage' | 'createdAt'>>,
): Run => new Run({ ...fields, userMessageId: fields.userMessage.id, updatedAt: fields.createdAt })

export const isActiveRun = hasStatus(activeRunStatuses)

/** A Run some worker already took: found at a worker's start, the worker that took it has died. */
export const isStartedRun = hasStatus(['preparing', 'generating'])

const isFailedRun = hasStatus(['failed'])

/**
 * A retry takes the chat's newest Run when it failed: only the newest user message ever gets a
 * Run, so the retry answers the chat's last user message.
 */
export const ensureRunRetryable = (chat: {
  readonly id: ChatId
  readonly run: Option.Option<RunFields>
}) =>
  chat.run.pipe(
    Option.filter<RunFields>(isFailedRun),
    Effect.fromOption(() => new RunNotRetryableError({ chatId: chat.id })),
  )

/** Which Runs may enter each status; `queued` is only ever built, never entered. */
const transitions = {
  preparing: hasStatus(['queued']),
  generating: isPreparing,
  done: hasStatus(['generating']),
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
    readonly patch?: Types.Simplify<
      Partial<Pick<Run, 'failure' | 'assistantMessageId' | 'assistantMessage'>>
    >
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
export type RunCompletion = { readonly reply: MessageFields; readonly at: DateTime.Utc }

export const completeRun = Effect.fn('completeRun')((run: Run, { reply, at }: RunCompletion) =>
  move(run, {
    to: 'done',
    at,
    patch: { assistantMessageId: Option.some(reply.id), assistantMessage: Option.some(reply) },
  }),
)

/** Why a Run failed and when. */
export type RunFailureInput = Types.Simplify<RunFailure & { readonly at: DateTime.Utc }>

export const failRun = Effect.fn('failRun')((run: Run, { reason, cause, at }: RunFailureInput) =>
  move(run, { to: 'failed', at, patch: { failure: Option.some({ reason, cause }) } }),
)
