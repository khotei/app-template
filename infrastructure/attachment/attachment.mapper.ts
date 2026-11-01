import { Schema } from 'effect'

import {
  Attachment,
  AttachmentId,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { ChatId, MessageId } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { AttachmentEntity } from '@app-template/kernel/data/attachment'

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
