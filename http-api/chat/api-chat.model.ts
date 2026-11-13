import { Schema } from 'effect'

import { ApiAttachment } from '#http-api/attachment/api-attachment.model'
import { ChatId, UserId } from '#http-api/shared/ids'
import * as limits from '#http-api/shared/limits'

export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(limits.chat.maxTitleLength),
).pipe(Schema.brand('ChatTitle'))
export type ChatTitle = typeof ChatTitle.Type

export const ChatStatus = Schema.Literals(['idle', 'queued', 'failed'])
export type ChatStatus = typeof ChatStatus.Type

export const ApiChat = Schema.Struct({
  id: ChatId,
  userId: UserId,
  title: Schema.OptionFromNullOr(ChatTitle),
  status: ChatStatus,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  attachments: Schema.Array(ApiAttachment),
})
export type ApiChat = typeof ApiChat.Type
