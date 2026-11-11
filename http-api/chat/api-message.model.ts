import { Schema } from 'effect'

import { ApiAttachment } from '#http-api/attachment/api-attachment.http'
import { ApiRunFields } from '#http-api/chat/api-run-fields.model'
import { ChatId, MessageId } from '#http-api/shared/ids'

export const MessageAuthor = Schema.Literals(['user', 'assistant'])
export type MessageAuthor = typeof MessageAuthor.Type

/** A message's own fields, as a Run carries its messages. */
export const ApiMessageFields = Schema.Struct({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  text: Schema.String,
  createdAt: Schema.DateTimeUtc,
})
export type ApiMessageFields = typeof ApiMessageFields.Type

/** A user's message with its newest Run, a reply with the Run that wrote it. */
export const ApiMessage = Schema.Struct({
  ...ApiMessageFields.fields,
  attachments: Schema.Array(ApiAttachment),
  run: Schema.OptionFromNullOr(ApiRunFields),
})
export type ApiMessage = typeof ApiMessage.Type
