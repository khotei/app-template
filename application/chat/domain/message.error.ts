import { Schema } from 'effect'

import { MessageId } from '#chat/domain/message.util'

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId },
) {}
