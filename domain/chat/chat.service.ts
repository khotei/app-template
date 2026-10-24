import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  Option,
  Order,
  Predicate,
  Schema,
  String as Str,
} from 'effect'

import type { AttachmentId } from '#domain/attachment/attachment.id'
import {
  ChatBusyError,
  MessageInputInvalidError,
  MessageStageInvalidError,
} from '#domain/chat/chat.error'
import type { ChatId, MessageId } from '#domain/chat/chat.id'
import {
  type ActiveMessage,
  ActiveMessageStage,
  Chat,
  Message,
  MessageAuthor,
  MessageFailure,
  type MessageStage,
} from '#domain/chat/chat.model'
import type { UserId } from '#domain/user/user.id'

export class ChatRepository extends Context.Service<
  ChatRepository,
  {
    readonly insert: (chat: Chat) => Effect.Effect<void>
    readonly update: (chat: Chat) => Effect.Effect<void>
    readonly selectById: (id: ChatId) => Effect.Effect<Option.Option<Chat>>
    /** Returns the user's chats unordered. */
    readonly selectByUser: (userId: UserId) => Effect.Effect<ReadonlyArray<Chat>>
    readonly delete: (id: ChatId) => Effect.Effect<void>
  }
>()('@app-template/domain/chat/ChatRepository') {}

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    readonly insert: (message: Message) => Effect.Effect<void>
    readonly update: (message: Message) => Effect.Effect<void>
    readonly selectById: (id: MessageId) => Effect.Effect<Option.Option<Message>>
    /** Returns the chat's messages by `createdAt`, a tie broken by id. */
    readonly selectByChat: (chatId: ChatId) => Effect.Effect<ReadonlyArray<Message>>
    /** Returns the chat's active message, the one `isActiveMessage` holds for, if any. */
    readonly selectActiveByChat: (chatId: ChatId) => Effect.Effect<Option.Option<ActiveMessage>>
    readonly deleteByChat: (chatId: ChatId) => Effect.Effect<void>
  }
>()('@app-template/domain/chat/MessageRepository') {}

export const buildChat = (input: {
  readonly id: ChatId
  readonly userId: UserId
  readonly createdAt: DateTime.Utc
}): Chat =>
  new Chat({
    id: input.id,
    userId: input.userId,
    title: Option.none(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })

export const buildUserMessage = (input: {
  readonly id: MessageId
  readonly chatId: ChatId
  readonly text: string
  readonly attachmentIds: ReadonlyArray<AttachmentId>
  readonly createdAt: DateTime.Utc
}): Message =>
  new Message({
    id: input.id,
    chatId: input.chatId,
    author: 'user',
    stage: 'completed',
    text: input.text,
    attachmentIds: input.attachmentIds,
    error: Option.none(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
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
    stage: 'queued',
    text: '',
    attachmentIds: [],
    error: Option.none(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })

export const isTitledChat = (chat: Chat): boolean => Option.isSome(chat.title)

export const byLatestUpdate: Order.Order<Chat> = Order.flip(
  Order.mapInput(DateTime.Order, (chat: Chat) => chat.updatedAt),
)

export const isInChat =
  (chatId: ChatId) =>
  (message: Message): boolean =>
    message.chatId === chatId

const isActiveShape = Predicate.Struct({
  author: Schema.is(MessageAuthor.pick(['assistant'])),
  stage: Schema.is(ActiveMessageStage),
})

export const isActiveMessage = (message: Message): message is ActiveMessage =>
  isActiveShape(message)

export const ensureChatAcceptsMessage = Effect.fn('ensureChatAcceptsMessage')(function* (
  current: Option.Option<Message>,
) {
  const active = Option.filter(current, isActiveMessage)
  if (Option.isSome(active)) return yield* new ChatBusyError({ id: active.value.chatId })
})

export interface MessageInput {
  readonly text: string
  readonly attachmentIds: ReadonlyArray<AttachmentId>
}

export const ensureMessageInput = Effect.fn('ensureMessageInput')(function* (input: MessageInput) {
  if (Str.isEmpty(Str.trim(input.text)) && Arr.isReadonlyArrayEmpty(input.attachmentIds)) {
    return yield* new MessageInputInvalidError()
  }
  // A repeated id would pass the bindability check twice and bind one attachment once.
  if (Arr.dedupe(input.attachmentIds).length < input.attachmentIds.length) {
    return yield* new MessageInputInvalidError()
  }
})

const isPreparing = Predicate.and(isActiveMessage, (message) => message.stage === 'preparing')

/** Which messages may enter each stage; `queued` is only ever built, never entered. */
const transitions = {
  preparing: isActiveMessage,
  generating: isPreparing,
  completed: isActiveMessage,
  failed: isActiveMessage,
} as const satisfies Record<Exclude<MessageStage, 'queued'>, Predicate.Predicate<Message>>

const move = Effect.fnUntraced(function* (
  message: Message,
  {
    to,
    at,
    patch,
  }: {
    readonly to: keyof typeof transitions
    readonly at: DateTime.Utc
    readonly patch?: Partial<Pick<Message, 'text' | 'error'>>
  },
) {
  if (!transitions[to](message)) {
    return yield* new MessageStageInvalidError({ id: message.id, from: message.stage, to })
  }
  return new Message({ ...message, ...patch, stage: to, updatedAt: at })
})

export const prepareMessage = Effect.fn('prepareMessage')((message: Message, at: DateTime.Utc) =>
  move(message, { to: 'preparing', at, patch: { text: '', error: Option.none() } }),
)

export const generateMessage = Effect.fn('generateMessage')((message: Message, at: DateTime.Utc) =>
  move(message, { to: 'generating', at }),
)

export const completeMessage = Effect.fn('completeMessage')(
  (message: Message, { text, at }: { readonly text: string; readonly at: DateTime.Utc }) =>
    move(message, { to: 'completed', at, patch: { text, error: Option.none() } }),
)

const failureMessages = {
  ReplyFailed: 'The assistant could not reply. Please try again.',
} as const satisfies Record<MessageFailure['reason'], string>

export const failMessage = Effect.fn('failMessage')(
  (
    message: Message,
    { reason, cause, at }: Pick<MessageFailure, 'reason' | 'cause'> & { readonly at: DateTime.Utc },
  ) =>
    move(message, {
      to: 'failed',
      at,
      patch: {
        error: Option.some(new MessageFailure({ reason, message: failureMessages[reason], cause })),
      },
    }),
)
