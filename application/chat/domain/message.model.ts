import { Effect, Predicate, Schema, Struct } from 'effect'
import { Model } from 'effect/schema'

import { messageAuthors, textPattern } from '@app-template/kernel/data'

import { ChatId } from '#chat/domain/chat.util'
import { isBlank, MessageId } from '#chat/domain/message.util'
import { RunFields } from '#chat/domain/run-fields.model'

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
   * A user's newest Run, an assistant's own, flat; read with the message, never written. Its
   * `select` struct, not the class, so a plain record of a Run's fields fits it.
   */
  run: Model.Field({
    select: Schema.OptionFromNullOr(RunFields.select).pipe(
      Schema.withConstructorDefault(Effect.succeedNone),
    ),
    json: Schema.OptionFromNullOr(RunFields.json),
  }),
}) {}

/** A message's own fields: what a Run nests of it. */
export const MessageFields = Message.mapFields(Struct.omit(['run']))
export type MessageFields = typeof MessageFields.Type

/** A message's own fields on the wire. */
export const MessageFieldsJson = Message.json.mapFields(Struct.omit(['run']))
