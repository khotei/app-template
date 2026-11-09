import { Schema } from 'effect'

import { MessageId } from '#chat/domain/chat.id'

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId },
) {}

export class MessageInputInvalidError extends Schema.TaggedError<MessageInputInvalidError>()(
  'MessageInputInvalidError',
  {},
) {}
