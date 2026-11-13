import { Schema } from 'effect'

import { MessageColumns, MessageEntityInsert } from '@app-template/kernel/data'
import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { ChatId, MessageId } from '#chat/domain/chat.id'
import { Message } from '#chat/domain/message.model'
import { AttachmentFromEntity } from '#chat/services/attachment.mapper'
import { RunFieldsFromColumns } from '#chat/services/run-fields.mapper'

export const MessageFieldsFromColumns = Schema.Struct({
  ...MessageColumns.fields,
  id: MessageId,
  chatId: ChatId,
  createdAt: Schema.DateTimeUtcFromDate,
})

export const MessageFromEntity = Schema.Struct({
  ...MessageFieldsFromColumns.fields,
  // A nested class is laid by its encoded side, since encoding the parent hands it plain fields.
  attachments: Schema.Array(AttachmentFromEntity.from),
  run: Schema.OptionFromNullOr(RunFieldsFromColumns),
}).pipe(Schema.decodeTo(Message))

/** Encodes a message's own fields as its row; its attachments and Run are read, never written. */
export const encodeMessage = encodeRowWith(MessageFieldsFromColumns, MessageEntityInsert)

export const decodeMessage = decodeOptionalWith(MessageFromEntity)

export const decodeMessages = decodeManyWith(MessageFromEntity)
