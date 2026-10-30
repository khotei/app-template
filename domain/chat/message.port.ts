import { Context, type Effect, type Option, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { ChatId, MessageId } from '#domain/chat/chat.id'
import type { Message, MessageStatus } from '#domain/chat/message.model'
import type { UserId } from '#domain/user/user.id'

/** The stored status a write requires; the row is always found by the message's id. */
export type MessageWhere = Pick<Message, 'status'>

/**
 * The rows where every field named holds: `status` for a row with any of its values, `userId` for
 * the owner of the row's chat, so a message of another user's chat reads as absent.
 */
export type MessageSelectWhere = Types.Simplify<
  RequireAtLeastOne<{ readonly id: MessageId; readonly chatId: ChatId }> &
    Partial<{ readonly userId: UserId; readonly status: ReadonlyArray<MessageStatus> }>
>

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /**
     * Writes the message's own fields, never its attachments; dies when it writes nothing: the
     * message is active and its chat already has one.
     */
    readonly insert: (message: Message) => Effect.Effect<void>
    /**
     * Writes the message's own fields only while the stored one matches `where`, never its
     * attachments; dies when it writes nothing.
     */
    readonly update: (message: Message, where: MessageWhere) => Effect.Effect<void>
    /** Returns the first row in creation order where `where` holds, with its attachments. */
    readonly selectOne: (where: MessageSelectWhere) => Effect.Effect<Option.Option<Message>>
    /** Returns the rows where `where` holds with their attachments, in creation order, a tie broken by id. */
    readonly selectMany: (where: MessageSelectWhere) => Effect.Effect<ReadonlyArray<Message>>
  }
>()('@app-template/domain/chat/MessageRepository') {}
