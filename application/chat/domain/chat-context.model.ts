import { Effect, Schema } from 'effect'

import { Message } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'

/**
 * What a chat's reply sends the model: the chat's messages from `startMessageId`, oldest first,
 * none while they start at the chat's first, and the `summary` of those before it, none when a
 * cut wrote none.
 */
export class ChatContext extends Schema.Class<ChatContext>('ChatContext')({
  startMessageId: Schema.Option(MessageId),
  summary: Schema.Option(Schema.String).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  messages: Schema.Array(Message),
}) {}
