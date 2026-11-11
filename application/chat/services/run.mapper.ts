import { Schema } from 'effect'

import { RunEntityInsert } from '@app-template/kernel/data'
import { decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { Run } from '#chat/domain/run.model'
import { ChatFieldsFromColumns } from '#chat/services/chat.mapper'
import { MessageFieldsFromColumns } from '#chat/services/message.mapper'
import { RunFieldsFromColumns } from '#chat/services/run-fields.mapper'

export const RunFromEntity = Schema.Struct({
  ...RunFieldsFromColumns.fields,
  chat: ChatFieldsFromColumns,
  userMessage: MessageFieldsFromColumns,
  assistantMessage: Schema.OptionFromNullOr(MessageFieldsFromColumns),
}).pipe(Schema.decodeTo(Run))

/** Encodes a Run's own fields as its row; the nested chat and messages are read, never written. */
export const encodeRun = encodeRowWith(RunFieldsFromColumns, RunEntityInsert)

export const decodeRun = decodeOptionalWith(RunFromEntity)
