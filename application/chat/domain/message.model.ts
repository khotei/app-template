import { Effect, Predicate, Schema } from 'effect'

import { messageAuthors, textPattern } from '@app-template/kernel/data'
import { Stored } from '@app-template/packages/schema'

import { ChatId } from '#chat/domain/chat.util'
import { isBlank, MessageId } from '#chat/domain/message.util'
import { Run } from '#chat/domain/run.model'

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/** A message as `messages` holds it, read with its Run; a message is never changed. */
export class Message extends Stored.Class<Message>('Message')({
  id: Stored.GeneratedId(MessageId),
  chatId: ChatId,
  author: MessageAuthor,
  /** Finished text: a user's as asked, an assistant's as the Run that wrote it settled it. */
  text: Schema.String.check(
    Schema.isPattern(textPattern),
    Schema.makeFilter(Predicate.not(isBlank), {
      expected: 'a string with a non-whitespace character',
    }),
  ),
  createdAt: Stored.CreatedAt,
  /** A user's newest Run, an assistant's own, flat; read with the message, never written. */
  run: Stored.readOnly(
    Schema.OptionFromNullOr(Run.select).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  ),
}) {}
