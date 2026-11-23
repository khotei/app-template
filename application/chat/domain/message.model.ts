import { Effect, Predicate, Schema } from 'effect'
import { Model } from 'effect/schema'

import { ChatId, textPattern } from '#chat/domain/chat.util'
import { isBlank, MessageId } from '#chat/domain/message.util'
import { Run } from '#chat/domain/run.model'

export const messageAuthors = ['user', 'assistant'] as const

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/** A message as `messages` holds it, read with its Run; a message is never changed. */
export class Message extends Model.Class<Message>('Message')({
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
  /**
   * A user's the newest Run that answers it, an assistant's the one that wrote it, read with the
   * message as its json variant, which leaves `failure` off, and never written.
   */
  run: Model.FieldOnly(['select', 'json'])(
    Schema.OptionFromNullOr(Run.json).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  ),
}) {}
