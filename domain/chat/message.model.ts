import {
  Array as Arr,
  type DateTime,
  Effect,
  flow,
  Option,
  Predicate,
  Schema,
  String as Str,
} from 'effect'

import type { AttachmentId } from '#domain/attachment/attachment.id'
import { Attachment } from '#domain/attachment/attachment.model'
import { ChatId, MessageId } from '#domain/chat/chat.id'
import { MessageInputInvalidError, MessageStatusInvalidError } from '#domain/chat/message.error'
import { isPreparing, Status } from '#domain/shared/status.model'

export const MessageStatus = Status.pick(['queued', 'preparing', 'generating', 'done', 'failed'])
export type MessageStatus = typeof MessageStatus.Type

export const ActiveMessageStatus = MessageStatus.pick(['queued', 'preparing', 'generating'])
export type ActiveMessageStatus = typeof ActiveMessageStatus.Type

export const MessageAuthor = Schema.Literals(['user', 'assistant'])
export type MessageAuthor = typeof MessageAuthor.Type

export class MessageFailure extends Schema.Class<MessageFailure>('MessageFailure')({
  reason: Schema.Literals(['ReplyFailed', 'ReplyRefused']),
  /** A user-facing sentence fixed per reason; it never quotes the cause. */
  message: Schema.String,
  /** Diagnostic detail for operators; it never leaves the api. */
  cause: Schema.String,
}) {}

/** Who answered an assistant message, and with which instructions; it never leaves the api. */
export class MessageProvenance extends Schema.Class<MessageProvenance>('MessageProvenance')({
  provider: Schema.String,
  model: Schema.String,
  instructionsHash: Schema.String,
}) {}

export class Message extends Schema.Class<Message>('Message')({
  id: MessageId,
  chatId: ChatId,
  author: MessageAuthor,
  status: MessageStatus,
  text: Schema.String,
  error: Schema.Option(MessageFailure),
  /** Set by the `generating` move, so it names the last model asked. */
  provenance: Schema.Option(MessageProvenance),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  /** Bound by `AttachmentService.bind`, in upload order; the message's own writes never touch them. */
  attachments: Schema.Array(Attachment),
}) {}

/** An assistant message whose reply is still running; `isActiveMessage` narrows to it. */
export interface ActiveMessage extends Message {
  readonly author: 'assistant'
  readonly status: ActiveMessageStatus
}

export interface MessageInput {
  readonly text: string
  readonly attachmentIds: ReadonlyArray<AttachmentId>
}

export const buildUserMessage = (input: {
  readonly id: MessageId
  readonly chatId: ChatId
  readonly text: string
  readonly createdAt: DateTime.Utc
}): Message =>
  new Message({
    id: input.id,
    chatId: input.chatId,
    author: 'user',
    status: 'done',
    text: input.text,
    error: Option.none(),
    provenance: Option.none(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    attachments: [],
  })

export const buildAssistantMessage = (input: {
  readonly id: MessageId
  readonly chatId: ChatId
  readonly createdAt: DateTime.Utc
}): Message =>
  new Message({
    id: input.id,
    chatId: input.chatId,
    author: 'assistant',
    status: 'queued',
    text: '',
    error: Option.none(),
    provenance: Option.none(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    attachments: [],
  })

const isActiveShape = Predicate.Struct({
  author: Schema.is(MessageAuthor.pick(['assistant'])),
  status: Schema.is(ActiveMessageStatus),
})

export const isActiveMessage = (message: Message): message is ActiveMessage =>
  isActiveShape(message)

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

/** Which messages may enter each status; `queued` is only ever built, never entered. */
const transitions = {
  preparing: isActiveMessage,
  generating: Predicate.and(isActiveMessage, isPreparing),
  done: isActiveMessage,
  failed: isActiveMessage,
} as const satisfies Record<Exclude<MessageStatus, 'queued'>, Predicate.Predicate<Message>>

const move = Effect.fnUntraced(function* (
  message: Message,
  {
    to,
    at,
    patch,
  }: {
    readonly to: keyof typeof transitions
    readonly at: DateTime.Utc
    readonly patch?: Partial<Pick<Message, 'text' | 'error' | 'provenance'>>
  },
) {
  if (!transitions[to](message)) {
    return yield* new MessageStatusInvalidError({ id: message.id, from: message.status, to })
  }
  return new Message({ ...message, ...patch, status: to, updatedAt: at })
})

export const prepareMessage = Effect.fn('prepareMessage')((message: Message, at: DateTime.Utc) =>
  move(message, { to: 'preparing', at, patch: { text: '', error: Option.none() } }),
)

/** Who is asked for the reply and when the request is sent. */
export type MessageGeneration = {
  readonly provenance: MessageProvenance
  readonly at: DateTime.Utc
}

export const generateMessage = Effect.fn('generateMessage')(
  (message: Message, { provenance, at }: MessageGeneration) =>
    move(message, { to: 'generating', at, patch: { provenance: Option.some(provenance) } }),
)

/** The settled text of a reply and when it settled. */
export type MessageCompletion = { readonly text: string; readonly at: DateTime.Utc }

export const completeMessage = Effect.fn('completeMessage')(
  (message: Message, { text, at }: MessageCompletion) =>
    move(message, { to: 'done', at, patch: { text, error: Option.none() } }),
)

const failureMessages = {
  ReplyFailed: 'The assistant could not reply. Please try again.',
  ReplyRefused: 'The assistant declined to answer this message.',
} as const satisfies Record<MessageFailure['reason'], string>

/** Why a reply failed and when; the user-facing text comes from `failureMessages`. */
export type MessageFailureInput = Pick<MessageFailure, 'reason' | 'cause'> & {
  readonly at: DateTime.Utc
}

export const failMessage = Effect.fn('failMessage')(
  (message: Message, { reason, cause, at }: MessageFailureInput) =>
    move(message, {
      to: 'failed',
      at,
      patch: {
        error: Option.some(new MessageFailure({ reason, message: failureMessages[reason], cause })),
      },
    }),
)
