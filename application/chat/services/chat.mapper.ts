import { Option, Schema, Struct, type Types, UndefinedOr } from 'effect'

import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/db'
import { UserId } from '@app-template/identity-contract'
import {
  ChatEntity,
  ChatEntityInsert,
  type ChatEntityWhere,
  MessageEntity,
  MessageEntityInsert,
} from '@app-template/kernel/data/chat'

import { ChatId, MessageId } from '#domain/chat.id'
import { Chat, ChatTitle } from '#domain/chat.model'
import { Message, MessageFailure } from '#domain/message.model'
import { AttachmentFromEntity } from '#services/attachment.mapper'

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

/** The row found by `id`; every other field named must still hold, so an owner mismatch reads as absent. */
export type ChatWhere = Types.Simplify<
  { readonly id: ChatId } & Partial<Pick<Chat, 'userId' | 'title'>>
>

export const encodeChat = encodeRowWith(ChatFromEntity, ChatEntityInsert)

export const decodeChat = decodeOptionalWith(ChatFromEntity)

export const decodeChats = decodeManyWith(ChatFromEntity)

export const encodeMessage = encodeRowWith(MessageFromEntity, MessageEntityInsert)

export const decodeMessage = decodeOptionalWith(MessageFromEntity)

export const decodeMessages = decodeManyWith(MessageFromEntity)

export const encodeChatWhere = (where: ChatWhere): ChatEntityWhere =>
  Struct.evolve(where, { title: UndefinedOr.map(Option.getOrNull) })
