import { Schema } from 'effect'

import { ChatId } from '#domain/chat/chat.id'
import { ChatStatus } from '#domain/chat/chat-status.model'

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  'ChatNotFoundError',
  { id: ChatId },
) {}

export class ChatBusyError extends Schema.TaggedError<ChatBusyError>()('ChatBusyError', {
  id: ChatId,
}) {}

export class ChatStatusInvalidError extends Schema.TaggedError<ChatStatusInvalidError>()(
  'ChatStatusInvalidError',
  { id: ChatId, from: ChatStatus, to: ChatStatus },
) {}
