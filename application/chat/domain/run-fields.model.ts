import { Effect, Schema } from 'effect'
import { Model } from 'effect/schema'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
import { Status } from '#chat/domain/status.model'

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

/** A Run as `runs` holds it: an update writes its status, failure, reply and `updatedAt`. */
export class RunFields extends Model.Class<RunFields>('RunFields')({
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

/**
 * A Run as a chat and a message nest it: read with them as JSON, served as is, so its json
 * variant, which leaves `failure` off.
 */
export const NestedRun = RunFields.json
export type NestedRun = typeof NestedRun.Type
