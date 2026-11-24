import { DateTime, Effect, Predicate, Schema } from 'effect'

import { messageAuthors, textPattern } from '@app-template/kernel/data'

import { ChatId } from '#chat/domain/chat.util'
import { isBlank, MessageId } from '#chat/domain/message.util'
import { Run } from '#chat/domain/run.model'

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/**
 * A message's own fields: what a Run nests of it. `makeEffect` stamps a `createdAt` left out with
 * the clock's now.
 */
export const MessageFields = Schema.Struct({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  /** Finished text: a user's as asked, an assistant's as the Run that wrote it settled it. */
  text: Schema.String.check(
    Schema.isPattern(textPattern),
    Schema.makeFilter(Predicate.not(isBlank), {
      expected: 'a string with a non-whitespace character',
    }),
  ),
  createdAt: Schema.DateTimeUtcFromDate.pipe(Schema.withConstructorDefault(DateTime.now)),
})
export type MessageFields = typeof MessageFields.Type

export class Message extends Schema.Class<Message>('Message')({
  ...MessageFields.fields,
  /** A user's newest Run, an assistant's own, flat; read with the message, never written. */
  run: Schema.OptionFromNullOr(Run).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
}) {}
