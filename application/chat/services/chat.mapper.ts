import { Schema } from 'effect'

import { UserId } from '@app-template/application/identity'
import {
  ChatEntity,
  ChatEntityInsert,
  MessageEntity,
  MessageEntityInsert,
} from '@app-template/kernel/data'
import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { ChatId, MessageId } from '#chat/domain/chat.id'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { Message, MessageFailure } from '#chat/domain/message.model'
import { AttachmentFromEntity } from '#chat/services/attachment.mapper'

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

export const encodeChat = encodeRowWith(ChatFromEntity, ChatEntityInsert)

export const decodeChat = decodeOptionalWith(ChatFromEntity)

export const decodeChats = decodeManyWith(ChatFromEntity)

export const encodeMessage = encodeRowWith(MessageFromEntity, MessageEntityInsert)

export const decodeMessage = decodeOptionalWith(MessageFromEntity)

export const decodeMessages = decodeManyWith(MessageFromEntity)
