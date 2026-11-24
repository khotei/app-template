import { DateTime, Effect, Schema } from 'effect'

import { RunFailure, runStatuses } from '@app-template/kernel/data'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
import { Status } from '#chat/domain/status.model'

export const RunStatus = Status.pick(runStatuses)
export type RunStatus = typeof RunStatus.Type

// The column's shape is the model's own: one definition, served through the module's entry.
export { RunFailure }

/**
 * A Run's own fields: what a chat and a message nest of it. `makeEffect` stamps a timestamp left
 * out with the clock's now.
 */
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
  createdAt: Schema.DateTimeUtcFromDate.pipe(Schema.withConstructorDefault(DateTime.now)),
  updatedAt: Schema.DateTimeUtcFromDate.pipe(Schema.withConstructorDefault(DateTime.now)),
})
export type RunFields = typeof RunFields.Type
