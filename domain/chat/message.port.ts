import { Context, type Effect, type Option, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { ChatId, MessageId } from '#domain/chat/chat.id'
import type { Message, MessageAuthor, MessageDetail } from '#domain/chat/message.model'
import type { MessageStage } from '#domain/chat/message-stage.model'
import type { UserId } from '#domain/user/user.id'

/** The stored stage a write requires; the row is always found by the message's id. */
export type MessageWhere = Pick<Message, 'stage'>

/**
 * The rows where every field named holds; the chat's `userId` too, so a message of another
 * user's chat reads as absent.
 */
export type MessageOneWhere = Types.Simplify<
  RequireAtLeastOne<{ readonly id: MessageId; readonly chatId: ChatId }> &
    Partial<{ readonly userId: UserId }>
>

/** The rows where every field named holds; a list field holds for a row with any of its values. */
export type MessageManyWhere = {
  readonly chatId: ReadonlyArray<ChatId>
  readonly author?: MessageAuthor
  readonly stage?: ReadonlyArray<MessageStage>
}

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /** Dies when it writes nothing: the message is active and its chat already has one. */
    readonly insert: (message: Message) => Effect.Effect<void>
    /** Writes `message` only while the stored one matches `where`; dies when it writes nothing. */
    readonly update: (message: Message, where: MessageWhere) => Effect.Effect<void>
    /** Returns the first row in creation order where `where` holds. */
    readonly selectOne: (where: MessageOneWhere) => Effect.Effect<Option.Option<MessageDetail>>
    /** Returns the rows where `where` holds in creation order, a tie broken by id. */
    readonly selectMany: (where: MessageManyWhere) => Effect.Effect<ReadonlyArray<MessageDetail>>
  }
>()('@app-template/domain/chat/MessageRepository') {}
