import { Effect, Schema } from 'effect'

import { RunFailure, runStatuses } from '@app-template/kernel/data'
import { Stored } from '@app-template/packages/schema'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
import { Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

// The column's shape is the model's own: one definition, served through the module's entry.
export { RunFailure }

/**
 * A Run's own fields, as `runs` holds them: what a chat and a message nest of it. An update
 * writes its status, failure, reply and `updatedAt`.
 */
export class RunFields extends Stored.Class<RunFields>('RunFields')({
  id: Stored.insertOnly(RunId),
  chatId: Stored.insertOnly(ChatId),
  userMessageId: Stored.insertOnly(MessageId),
  status: RunStatus.pipe(Schema.withConstructorDefault(Effect.succeed('queued' as const))),
  failure: Schema.OptionFromNullOr(RunFailure).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  /** The reply's id, none until the Run is done. */
  assistantMessageId: Schema.OptionFromNullOr(MessageId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  createdAt: Stored.CreatedAt,
  updatedAt: Stored.UpdatedAt,
}) {}
