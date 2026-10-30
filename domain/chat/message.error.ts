import { Schema } from 'effect'

import { MessageId } from '#domain/chat/chat.id'
import { MessageStatus } from '#domain/chat/message-status.model'

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId },
) {}

export class MessageInputInvalidError extends Schema.TaggedError<MessageInputInvalidError>()(
  'MessageInputInvalidError',
  {},
) {}

export class MessageStatusInvalidError extends Schema.TaggedError<MessageStatusInvalidError>()(
  'MessageStatusInvalidError',
  { id: MessageId, from: MessageStatus, to: MessageStatus },
) {}
