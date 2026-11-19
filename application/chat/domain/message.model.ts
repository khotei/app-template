import { Effect, Schema } from 'effect'

import { messageAuthors, textPattern } from '@app-template/kernel/data'

import { Attachment } from '#chat/domain/attachment.model'
import { ChatId } from '#chat/domain/chat.util'
import { MessageInputInvalidError } from '#chat/domain/message.error'
import { isBlank, MessageId } from '#chat/domain/message.util'
import { RunFields } from '#chat/domain/run-fields.model'

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/** A message's own fields: what a Run nests of it. */
export const MessageFields = Schema.Struct({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  /** Finished text: a user's as sent, an assistant's as the Run that wrote it settled it. */
  text: Schema.String.check(Schema.isPattern(textPattern)),
  createdAt: Schema.DateTimeUtcFromDate,
})
export type MessageFields = typeof MessageFields.Type

export class Message extends Schema.Class<Message>('Message')({
  ...MessageFields.fields,
  /** Bound by the send, in upload order; the message's own writes never touch them. */
  attachments: Schema.Array(Attachment).pipe(Schema.withConstructorDefault(Effect.succeed([]))),
  /** A user's newest Run, an assistant's own, flat; read with the message, never written. */
  run: Schema.OptionFromNullOr(RunFields).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
}) {}

export interface MessageInput {
  readonly text: string
}

export const ensureMessageInput = Effect.fn('ensureMessageInput')(function* (input: MessageInput) {
  if (isBlank(input.text)) {
    return yield* new MessageInputInvalidError()
  }
})
