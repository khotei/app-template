import { Schema } from 'effect'

import { ChatId } from '#http-api/shared/ids'

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  'ChatNotFoundError',
  { id: ChatId },
  { httpApiStatus: 404 },
) {}

export class ChatBusyError extends Schema.TaggedError<ChatBusyError>()(
  'ChatBusyError',
  { id: ChatId },
  { httpApiStatus: 409 },
) {}
