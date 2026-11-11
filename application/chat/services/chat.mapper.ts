import { Schema } from 'effect'

import { UserId } from '@app-template/application/identity'
import { ChatColumns, ChatEntityInsert } from '@app-template/kernel/data'
import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { ChatId } from '#chat/domain/chat.id'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { AttachmentFromEntity } from '#chat/services/attachment.mapper'
import { RunFieldsFromColumns } from '#chat/services/run-fields.mapper'

export const ChatFieldsFromColumns = Schema.Struct({
  ...ChatColumns.fields,
  id: ChatId,
  userId: UserId,
  title: Schema.OptionFromNullOr(ChatTitle),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
})

export const ChatFromEntity = Schema.Struct({
  ...ChatFieldsFromColumns.fields,
  // A nested class is laid by its encoded side, since encoding the parent hands it plain fields.
  attachments: Schema.Array(AttachmentFromEntity.from),
  run: Schema.OptionFromNullOr(RunFieldsFromColumns),
}).pipe(Schema.decodeTo(Chat))

/** Encodes a chat's own fields as its row; its attachments and Run are read, never written. */
export const encodeChat = encodeRowWith(ChatFieldsFromColumns, ChatEntityInsert)

export const decodeChat = decodeOptionalWith(ChatFromEntity)

export const decodeChats = decodeManyWith(ChatFromEntity)
