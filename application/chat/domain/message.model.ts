import { Effect, Predicate, Schema, Struct } from 'effect'

import { messageAuthors, textPattern } from '@app-template/kernel/data'
import { Stored } from '@app-template/packages/schema'

import { ChatId } from '#chat/domain/chat.util'
import { isBlank, MessageId } from '#chat/domain/message.util'
import { RunFields } from '#chat/domain/run-fields.model'

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/** A message as `messages` holds it, read with its Run; a message is never changed. */
export class Message extends Stored.Class<Message>('Message')({
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
  createdAt: Stored.CreatedAt,
  /** A user's newest Run, an assistant's own, flat; read with the message, never written. */
  run: Stored.readOnly(
    Schema.OptionFromNullOr(RunFields.select).pipe(
      Schema.withConstructorDefault(Effect.succeedNone),
    ),
  ),
}) {}

/** A message's own fields: what a Run nests of it. */
export const MessageFields = Message.mapFields(Struct.omit(['run']))
export type MessageFields = typeof MessageFields.Type
