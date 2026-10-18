import { Schema } from 'effect'

import { ChatId, MessageId, MessageStage } from '#domain/chat/chat.model'

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  'ChatNotFoundError',
  { id: ChatId },
) {}

export class ChatBusyError extends Schema.TaggedError<ChatBusyError>()('ChatBusyError', {
  id: ChatId,
}) {}

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId },
) {}

export class MessageInputInvalidError extends Schema.TaggedError<MessageInputInvalidError>()(
  'MessageInputInvalidError',
  {},
) {}

export class MessageStageInvalidError extends Schema.TaggedError<MessageStageInvalidError>()(
  'MessageStageInvalidError',
  { id: MessageId, from: MessageStage, to: MessageStage },
) {}
