import { Effect, Predicate, Schema } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '@app-template/application/identity/contract'

import { ChatId } from '#chat/domain/chat.util'
import { isBlank, MessageId, textPattern } from '#chat/domain/message.util'
import { Run } from '#chat/domain/run.model'

export const MessageAuthor = Schema.Literals(['user', 'assistant'])
export type MessageAuthor = typeof MessageAuthor.Type

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId },
  { httpApiStatus: 404 },
) {}

/** A message as `messages` holds it, read with its Run; a message is never changed. */
export class Message extends Model.Class<Message>('Message')({
  id: Model.UuidV7Insert(MessageId),
  chatId: ChatId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  /** The owner of the message's chat. */
  userId: UserId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  author: MessageAuthor.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  /** Finished text: a user's as asked, an assistant's as the Run that wrote it settled it. */
  text: Schema.String.check(
    Schema.isPattern(textPattern),
    Schema.makeFilter(Predicate.not(isBlank), {
      expected: 'a string with a non-whitespace character',
    }),
  ),
  createdAt: Model.DateTimeInsertFromDate,
  /** A user's newest Run, an assistant's own; read with the message, never written. */
  run: Schema.OptionFromNullOr(Run).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
    Model.FieldOnly(['select']),
  ),
}) {}
