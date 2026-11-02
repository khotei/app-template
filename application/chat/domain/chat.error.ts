import { Schema } from 'effect'

import { ChatId } from '#chat/domain/chat.id'
import { Status } from '#chat/domain/status.model'

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  'ChatNotFoundError',
  { id: ChatId },
) {}

export class ChatBusyError extends Schema.TaggedError<ChatBusyError>()('ChatBusyError', {
  id: ChatId,
}) {}

export class ChatStatusInvalidError extends Schema.TaggedError<ChatStatusInvalidError>()(
  'ChatStatusInvalidError',
  { id: ChatId, from: Status, to: Status },
) {}
