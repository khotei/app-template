import { Context, type Effect, type Option } from 'effect'

import type { ChatId, MessageId } from '#domain/chat/chat.id'
import type { ActiveMessage, Message, MessageDetail } from '#domain/chat/message.model'

/** The stored fields a conditional write requires; the row is always found by the message's id. */
export type MessageWhere = Pick<Message, 'stage'>

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /** Answers `false` and writes nothing when the message is active and its chat has one. */
    readonly insert: (message: Message) => Effect.Effect<boolean>
    /** Writes `message` only while the stored one matches `where`; answers whether it wrote. */
    readonly update: (message: Message, where: MessageWhere) => Effect.Effect<boolean>
    readonly selectById: (id: MessageId) => Effect.Effect<Option.Option<Message>>
    readonly selectDetail: (id: MessageId) => Effect.Effect<Option.Option<MessageDetail>>
    /** Returns the chat's messages in creation order, a tie broken by id. */
    readonly selectByChat: (chatId: ChatId) => Effect.Effect<ReadonlyArray<MessageDetail>>
    readonly existsByChat: (chatId: ChatId) => Effect.Effect<boolean>
    /** Returns the chat's active message, the one `isActiveMessage` holds for, if any. */
    readonly selectActiveByChat: (chatId: ChatId) => Effect.Effect<Option.Option<ActiveMessage>>
  }
>()('@app-template/domain/chat/MessageRepository') {}
