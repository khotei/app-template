import { Array as Arr, Effect, flow, Schema, String as Str, type Types } from 'effect'

import { messageAuthors } from '@app-template/kernel/data'

import type { AttachmentId } from '#chat/domain/attachment.id'
import { Attachment } from '#chat/domain/attachment.model'
import { ChatId, MessageId } from '#chat/domain/chat.id'
import { MessageInputInvalidError } from '#chat/domain/message.error'

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/** A message's own fields: what a Run nests of it. */
export const MessageFields = Schema.Struct({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  /** Finished text: a user's as sent, an assistant's as the Run that wrote it settled it. */
  text: Schema.String,
  createdAt: Schema.DateTimeUtc,
})
export type MessageFields = typeof MessageFields.Type

export class Message extends Schema.Class<Message>('Message')({
  ...MessageFields.fields,
  /** Bound by the send, in upload order; the message's own writes never touch them. */
  attachments: Schema.Array(Attachment),
}) {}

export interface MessageInput {
  readonly text: string
  readonly attachmentIds: ReadonlyArray<AttachmentId>
}

export const buildUserMessage = (
  fields: Types.Simplify<Pick<Message, 'id' | 'chatId' | 'text' | 'createdAt'>>,
): Message => new Message({ ...fields, author: 'user', attachments: [] })

/** The reply a done Run writes. */
export const buildAssistantMessage = (
  fields: Types.Simplify<Pick<Message, 'id' | 'chatId' | 'text' | 'createdAt'>>,
): Message => new Message({ ...fields, author: 'assistant', attachments: [] })

export const isBlank: (text: string) => boolean = flow(Str.trim, Str.isEmpty)

export const ensureMessageInput = Effect.fn('ensureMessageInput')(function* (input: MessageInput) {
  if (isBlank(input.text) && Arr.isReadonlyArrayEmpty(input.attachmentIds)) {
    return yield* new MessageInputInvalidError()
  }
  // A repeated id would pass the bindability check twice and bind one attachment once.
  if (Arr.dedupe(input.attachmentIds).length < input.attachmentIds.length) {
    return yield* new MessageInputInvalidError()
  }
})
