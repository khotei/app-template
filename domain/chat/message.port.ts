import { Context, type Effect, type Option, type Types } from 'effect'

import type { ChatId, MessageId } from '#domain/chat/chat.id'
import type { ActiveMessage, Message, MessageDetail } from '#domain/chat/message.model'
import type { UserId } from '#domain/user/user.id'

/**
 * `id` finds the row; `chatId` and the chat's `userId` must still hold, so a message of another
 * chat or of another user's chat reads as absent.
 */
export type MessageWhere = Types.Simplify<
  { readonly id: MessageId } & Partial<{ readonly chatId: ChatId; readonly userId: UserId }>
>

/** The stored stage a conditional write requires; the row is always found by the message's id. */
export type MessageStageWhere = Pick<Message, 'stage'>

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /** Answers `false` and writes nothing when the message is active and its chat has one. */
    readonly insert: (message: Message) => Effect.Effect<boolean>
    /** Writes `message` only while the stored one matches `where`; answers whether it wrote. */
    readonly update: (message: Message, where: MessageStageWhere) => Effect.Effect<boolean>
    readonly selectOne: (where: MessageWhere) => Effect.Effect<Option.Option<Message>>
    readonly selectDetail: (where: MessageWhere) => Effect.Effect<Option.Option<MessageDetail>>
    /** Returns the chat's messages in creation order, a tie broken by id. */
    readonly selectByChat: (chatId: ChatId) => Effect.Effect<ReadonlyArray<MessageDetail>>
    readonly existsByChat: (chatId: ChatId) => Effect.Effect<boolean>
    /** Returns the chat's active message, the one `isActiveMessage` holds for, if any. */
    readonly selectActiveByChat: (chatId: ChatId) => Effect.Effect<Option.Option<ActiveMessage>>
  }
>()('@app-template/domain/chat/MessageRepository') {}
