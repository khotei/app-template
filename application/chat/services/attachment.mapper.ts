import { Schema } from 'effect'

import { UserId } from '@app-template/identity-contract'
import { AttachmentEntity, AttachmentEntityInsert } from '@app-template/kernel/data'
import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { AttachmentId } from '#domain/attachment.id'
import { Attachment, FileName, FileSize, MediaType } from '#domain/attachment.model'
import { ChatId, MessageId } from '#domain/chat.id'

export const AttachmentFromEntity = Schema.Struct({
  ...AttachmentEntity.fields,
  id: AttachmentId,
  userId: UserId,
  messageId: Schema.OptionFromNullOr(MessageId),
  chatId: Schema.OptionFromNullOr(ChatId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(Attachment))

export const encodeAttachment = encodeRowWith(AttachmentFromEntity, AttachmentEntityInsert)

export const decodeAttachment = decodeOptionalWith(AttachmentFromEntity)

export const decodeAttachments = decodeManyWith(AttachmentFromEntity)
