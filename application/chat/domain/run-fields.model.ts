import { Effect, Schema } from 'effect'
import { Model } from 'effect/schema'

import { RunFailure, runStatuses } from '@app-template/kernel/data'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
import { Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

// The column's shape is the model's own: one definition, served through the module's entry.
export { RunFailure }

/** Written once, by the insert. */
const insertOnly = Model.FieldExcept(['update', 'jsonUpdate'])

/**
 * A Run's own fields, as `runs` holds them: what a chat and a message nest of it. An update
 * writes its status, failure, reply and `updatedAt`; no json variant holds `failure`, so the
 * provider's text never reaches the wire.
 */
export class RunFields extends Model.Class<RunFields>('RunFields')({
  // `Model.UuidV7Insert` without its update variant: the repository finds the row by its `where`.
  id: Model.Field({ select: RunId, insert: Model.UuidV7WithGenerate(RunId), json: RunId }),
  chatId: insertOnly(ChatId),
  userMessageId: insertOnly(MessageId),
  status: RunStatus.pipe(Schema.withConstructorDefault(Effect.succeed('queued' as const))),
  failure: Model.Sensitive(
    Schema.OptionFromNullOr(RunFailure).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  ),
  /** The reply's id, none until the Run is done. */
  assistantMessageId: Schema.OptionFromNullOr(MessageId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
}) {}
