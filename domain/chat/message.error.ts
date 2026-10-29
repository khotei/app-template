import { Schema } from 'effect'

import { MessageId } from '#domain/chat/chat.id'
import { MessageStage } from '#domain/chat/message-stage.model'

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
