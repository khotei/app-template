import { Schema } from 'effect'

import { MessageId } from '#http-api/shared/ids'

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId },
  { httpApiStatus: 404 },
) {}

export class MessageInputInvalidError extends Schema.TaggedError<MessageInputInvalidError>()(
  'MessageInputInvalidError',
  {},
  { httpApiStatus: 400 },
) {}
