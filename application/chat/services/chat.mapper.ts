import { Schema } from 'effect'

import { UserId } from '@app-template/application/identity'
import { ChatEntity, ChatEntityInsert } from '@app-template/kernel/data'
import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { ChatId } from '#chat/domain/chat.id'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { AttachmentFromEntity } from '#chat/services/attachment.mapper'
import { RunFromEntity } from '#chat/services/run.mapper'

export const ChatFromEntity = Schema.Struct({
  ...ChatEntity.fields,
  id: ChatId,
  userId: UserId,
  title: Schema.OptionFromNullOr(ChatTitle),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
  attachments: Schema.Array(AttachmentFromEntity.from),
  latestRun: Schema.OptionFromNullOr(RunFromEntity.from),
}).pipe(Schema.decodeTo(Chat))

export const encodeChat = encodeRowWith(ChatFromEntity, ChatEntityInsert)

export const decodeChat = decodeOptionalWith(ChatFromEntity)

export const decodeChats = decodeManyWith(ChatFromEntity)
