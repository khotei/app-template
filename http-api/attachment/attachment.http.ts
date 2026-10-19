import { Schema, Struct } from 'effect'

import { Attachment as AttachmentModel } from '@app-template/domain/attachment'
import { MessageId } from '@app-template/domain/chat'

export const Attachment = AttachmentModel.mapFields((fields) => ({
  ...Struct.omit(fields, ['userId']),
  messageId: Schema.OptionFromNullOr(MessageId),
}))
export type Attachment = typeof Attachment.Type
