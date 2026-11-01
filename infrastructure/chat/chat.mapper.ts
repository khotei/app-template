import { Schema } from 'effect'

import {
  Chat,
  ChatId,
  ChatTitle,
  Message,
  MessageFailure,
  MessageId,
} from '@app-template/domain/chat'
import { UserId } from '@app-template/identity-contract'
import { ChatEntity, MessageEntity } from '@app-template/kernel/data/chat'

import { AttachmentFromEntity } from '#infrastructure/attachment/attachment.mapper'

// A nested model is laid by its encoded side, since encoding the parent hands it plain fields.
const attachments = Schema.Array(AttachmentFromEntity.from)

export const ChatFromEntity = Schema.Struct({
  ...ChatEntity.fields,
  id: ChatId,
  userId: UserId,
  title: Schema.OptionFromNullOr(ChatTitle),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
  attachments,
}).pipe(Schema.decodeTo(Chat))

export const MessageFromEntity = Schema.Struct({
  ...MessageEntity.fields,
  id: MessageId,
  chatId: ChatId,
  error: Schema.OptionFromNullOr(Schema.toEncoded(MessageFailure)),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
  attachments,
}).pipe(Schema.decodeTo(Message))
