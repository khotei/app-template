import { Context, type DateTime, Effect, Option, Schema, String as Str } from 'effect'

import type { AttachmentId } from '#domain/attachment/attachment.model'
import {
  ChatBusyError,
  MessageInputInvalidError,
  MessageStageInvalidError,
} from '#domain/chat/chat.error'
import {
  ActiveMessageStage,
  Chat,
  type ChatId,
  Message,
  MessageFailure,
  type MessageId,
} from '#domain/chat/chat.model'
import type { UserId } from '#domain/user/user.model'

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
    /** Returns the chat's messages in insertion order. */
    readonly selectByChat: (chatId: ChatId) => Effect.Effect<ReadonlyArray<Message>>
    /** Returns the chat's active message, the one `isActiveMessage` holds for, if any. */
    readonly selectActiveByChat: (chatId: ChatId) => Effect.Effect<Option.Option<Message>>
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

const isActiveStage = Schema.is(ActiveMessageStage)

export const isActiveMessage = (message: Message): boolean =>
  message.author === 'assistant' && isActiveStage(message.stage)

export const ensureChatAcceptsMessage = Effect.fn('ensureChatAcceptsMessage')(function* (
  current: Option.Option<Message>,
) {
  if (Option.isSome(current) && isActiveMessage(current.value)) {
    return yield* new ChatBusyError({ id: current.value.chatId })
  }
})

export const ensureMessageInput = Effect.fn('ensureMessageInput')(function* (input: {
  readonly text: string
  readonly attachmentIds: ReadonlyArray<AttachmentId>
}) {
  if (Str.isEmpty(Str.trim(input.text)) && input.attachmentIds.length === 0) {
    return yield* new MessageInputInvalidError()
  }
})

export const prepareMessage = Effect.fn('prepareMessage')(function* (
  message: Message,
  at: DateTime.Utc,
) {
  if (!isActiveMessage(message)) {
    return yield* new MessageStageInvalidError({
      id: message.id,
      from: message.stage,
      to: 'preparing',
    })
  }
  return new Message({
    ...message,
    stage: 'preparing',
    text: '',
    error: Option.none(),
    updatedAt: at,
  })
})

export const generateMessage = Effect.fn('generateMessage')(function* (
  message: Message,
  at: DateTime.Utc,
) {
  if (!isActiveMessage(message) || message.stage !== 'preparing') {
    return yield* new MessageStageInvalidError({
      id: message.id,
      from: message.stage,
      to: 'generating',
    })
  }
  return new Message({ ...message, stage: 'generating', updatedAt: at })
})

export const completeMessage = Effect.fn('completeMessage')(function* (
  message: Message,
  text: string,
  at: DateTime.Utc,
) {
  if (!isActiveMessage(message)) {
    return yield* new MessageStageInvalidError({
      id: message.id,
      from: message.stage,
      to: 'completed',
    })
  }
  return new Message({ ...message, stage: 'completed', text, error: Option.none(), updatedAt: at })
})

const failureMessages = {
  ReplyFailed: 'The assistant could not reply. Please try again.',
} as const satisfies Record<MessageFailure['reason'], string>

export const failMessage = Effect.fn('failMessage')(function* (
  message: Message,
  reason: MessageFailure['reason'],
  cause: string,
  at: DateTime.Utc,
) {
  if (!isActiveMessage(message)) {
    return yield* new MessageStageInvalidError({
      id: message.id,
      from: message.stage,
      to: 'failed',
    })
  }
  return new Message({
    ...message,
    stage: 'failed',
    error: Option.some(new MessageFailure({ reason, message: failureMessages[reason], cause })),
    updatedAt: at,
  })
})
