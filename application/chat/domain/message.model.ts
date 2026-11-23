import { Effect, Predicate, Schema } from 'effect'
import { Model } from 'effect/schema'

import { ChatId, textPattern } from '#chat/domain/chat.util'
import { isBlank, MessageId } from '#chat/domain/message.util'
import { NestedRun } from '#chat/domain/run-fields.model'

export const messageAuthors = ['user', 'assistant'] as const

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/** A message as `messages` holds it; a message is never changed. */
export class MessageFields extends Model.Class<MessageFields>('MessageFields')({
  id: Model.UuidV7Insert(MessageId),
  chatId: ChatId,
  author: MessageAuthor,
  /** Finished text: a user's as asked, an assistant's as the Run that wrote it settled it. */
  text: Schema.String.check(
    Schema.isPattern(textPattern),
    Schema.makeFilter(Predicate.not(isBlank), {
      expected: 'a string with a non-whitespace character',
    }),
  ),
  createdAt: Model.DateTimeInsertFromDate,
}) {}

/** A message as a Run nests it: read with the Run as JSON, served as is. */
export const NestedMessage = MessageFields.json
export type NestedMessage = typeof NestedMessage.Type

/** A message with its Run: a user's the newest that answers it, an assistant's the one that wrote it. */
export class Message extends MessageFields.extend<Message>('Message')({
  run: Model.FieldOnly(['select', 'json'])(
    Schema.OptionFromNullOr(NestedRun).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  ),
}) {}
