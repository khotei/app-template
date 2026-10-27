import { Schema } from 'effect'

import { ChatId } from '#domain/chat/chat.id'

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  'ChatNotFoundError',
  { id: ChatId },
) {}

export class ChatBusyError extends Schema.TaggedError<ChatBusyError>()('ChatBusyError', {
  id: ChatId,
}) {}

export class ChatTitledError extends Schema.TaggedError<ChatTitledError>()('ChatTitledError', {
  id: ChatId,
}) {}
