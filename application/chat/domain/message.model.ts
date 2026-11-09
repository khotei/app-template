import { Array as Arr, Effect, flow, Option, Schema, String as Str, type Types } from 'effect'

import { messageAuthors } from '@app-template/kernel/data'

import type { AttachmentId } from '#chat/domain/attachment.id'
import { Attachment } from '#chat/domain/attachment.model'
import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { MessageInputInvalidError } from '#chat/domain/message.error'

export const MessageAuthor = Schema.Literals(messageAuthors)
export type MessageAuthor = typeof MessageAuthor.Type

/** Finished text: a user's as sent, an assistant's as its Run settled it. */
export class Message extends Schema.Class<Message>('Message')({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  text: Schema.String,
  /** The Run that wrote an assistant's message; none for a user's. */
  runId: Schema.Option(RunId),
  createdAt: Schema.DateTimeUtc,
  /** Bound by the send, in upload order; the message's own writes never touch them. */
  attachments: Schema.Array(Attachment),
}) {}

export interface MessageInput {
  readonly text: string
  readonly attachmentIds: ReadonlyArray<AttachmentId>
}

export const buildUserMessage = (
  fields: Types.Simplify<Pick<Message, 'id' | 'chatId' | 'text' | 'createdAt'>>,
): Message => new Message({ ...fields, author: 'user', runId: Option.none(), attachments: [] })

/** The reply a done Run writes, `runId` that Run's. */
export const buildAssistantMessage = (
  fields: Types.Simplify<Pick<Message, 'id' | 'chatId' | 'text' | 'createdAt'>> & {
    readonly runId: RunId
  },
): Message =>
  new Message({ ...fields, author: 'assistant', runId: Option.some(fields.runId), attachments: [] })

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
