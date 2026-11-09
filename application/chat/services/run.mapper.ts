import { Schema } from 'effect'

import { RunEntity, RunEntityInsert } from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'

import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Run, RunFailure } from '#chat/domain/run.model'

export const RunFromEntity = Schema.Struct({
  ...RunEntity.fields,
  id: RunId,
  chatId: ChatId,
  userMessageId: MessageId,
  failure: Schema.OptionFromNullOr(Schema.toEncoded(RunFailure)),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(Run))

export const encodeRun = encodeRowWith(RunFromEntity, RunEntityInsert)
