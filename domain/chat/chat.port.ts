import { Context, type Effect, type Option, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { ChatId } from '#domain/chat/chat.id'
import type { Chat } from '#domain/chat/chat.model'
import type { UserId } from '#domain/user/user.id'

/** The fields a write may change; `userId` and `createdAt` never change. */
export type ChatSet = Types.Simplify<RequireAtLeastOne<Pick<Chat, 'title' | 'updatedAt'>>>

/** The row found by `id`; every other field named must still hold, so an owner mismatch reads as absent. */
export type ChatWhere = Types.Simplify<
  { readonly id: ChatId } & Partial<Pick<Chat, 'userId' | 'title'>>
>

export class ChatRepository extends Context.Service<
  ChatRepository,
  {
    readonly insert: (chat: Chat) => Effect.Effect<void>
    /** Writes `set` where `where` holds; dies when it writes nothing. */
    readonly update: (set: ChatSet, where: ChatWhere) => Effect.Effect<void>
    /** With `forUpdate`, holds the row it reads until the transaction ends. */
    readonly selectOne: (
      where: ChatWhere,
      options?: { readonly forUpdate?: boolean },
    ) => Effect.Effect<Option.Option<Chat>>
    /** Returns the user's chats, the most recently updated first. */
    readonly selectByUser: (userId: UserId) => Effect.Effect<ReadonlyArray<Chat>>
    /** Removes the chat with its messages; dies when it removes nothing or while one has an attachment. */
    readonly delete: (id: ChatId) => Effect.Effect<void>
  }
>()('@app-template/domain/chat/ChatRepository') {}
