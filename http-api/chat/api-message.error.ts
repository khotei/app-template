import { Schema } from 'effect'

import { MessageAuthor } from '#http-api/chat/api-message.model'
import { MessageId } from '#http-api/shared/ids'

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId, author: Schema.OptionFromNullOr(MessageAuthor) },
  { httpApiStatus: 404 },
) {}

export class MessageInputInvalidError extends Schema.TaggedError<MessageInputInvalidError>()(
  'MessageInputInvalidError',
  {},
  { httpApiStatus: 400 },
) {}
