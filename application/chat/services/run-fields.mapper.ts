import { Schema } from 'effect'

import { RunColumns } from '@app-template/kernel/data'

import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { RunFailure } from '#chat/domain/run-fields.model'

export const RunFieldsFromColumns = Schema.Struct({
  ...RunColumns.fields,
  id: RunId,
  chatId: ChatId,
  userMessageId: MessageId,
  failure: Schema.OptionFromNullOr(RunFailure),
  assistantMessageId: Schema.OptionFromNullOr(MessageId),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
})
