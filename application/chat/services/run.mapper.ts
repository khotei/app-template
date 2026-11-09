import { Schema } from 'effect'

import { RunEntity, RunEntityInsert } from '@app-template/kernel/data'
import { decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Run, RunFailure } from '#chat/domain/run.model'
import { MessageFromEntity } from '#chat/services/message.mapper'

export const RunFromEntity = Schema.Struct({
  ...RunEntity.fields,
  id: RunId,
  chatId: ChatId,
  userMessageId: MessageId,
  failure: Schema.OptionFromNullOr(Schema.toEncoded(RunFailure)),
  assistantMessageId: Schema.OptionFromNullOr(MessageId),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
  // A nested model is laid by its encoded side, since encoding the parent hands it plain fields.
  userMessage: MessageFromEntity.from,
  assistantMessage: Schema.OptionFromNullOr(MessageFromEntity.from),
}).pipe(Schema.decodeTo(Run))

export const encodeRun = encodeRowWith(RunFromEntity, RunEntityInsert)

export const decodeRun = decodeOptionalWith(RunFromEntity)
