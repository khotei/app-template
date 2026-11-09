import { Schema } from 'effect'

import { MessageEntity, MessageEntityInsert } from '@app-template/kernel/data'
import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Message } from '#chat/domain/message.model'
import { AttachmentFromEntity } from '#chat/services/attachment.mapper'

export const MessageFromEntity = Schema.Struct({
  ...MessageEntity.fields,
  id: MessageId,
  chatId: ChatId,
  runId: Schema.OptionFromNullOr(RunId),
  createdAt: Schema.DateTimeUtcFromDate,
  attachments: Schema.Array(AttachmentFromEntity.from),
}).pipe(Schema.decodeTo(Message))

export const encodeMessage = encodeRowWith(MessageFromEntity, MessageEntityInsert)

export const decodeMessage = decodeOptionalWith(MessageFromEntity)

export const decodeMessages = decodeManyWith(MessageFromEntity)
