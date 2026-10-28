import { Context, type Effect, type Option, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { ChatId } from '#domain/chat/chat.id'
import type { Chat, ChatDetail, ChatSummary } from '#domain/chat/chat.model'
import type { UserId } from '#domain/user/user.id'

/** The fields a write may change; `userId` and `createdAt` never change. */
export type ChatSet = Types.Simplify<RequireAtLeastOne<Pick<Chat, 'title' | 'updatedAt'>>>

/** The row a write finds by `id`; `title` must still hold its value. */
export type ChatWhere = Types.Simplify<{ readonly id: ChatId } & Partial<Pick<Chat, 'title'>>>

/** The row a read finds by `id`; `userId` must still hold, so an owner mismatch reads as absent. */
export type ChatOneWhere = Types.Simplify<{ readonly id: ChatId } & Partial<Pick<Chat, 'userId'>>>

export class ChatRepository extends Context.Service<
  ChatRepository,
  {
    readonly insert: (chat: Chat) => Effect.Effect<void>
    /** Writes `set` where `where` holds; answers whether it wrote. */
    readonly update: (set: ChatSet, where: ChatWhere) => Effect.Effect<boolean>
    readonly selectOne: (where: ChatOneWhere) => Effect.Effect<Option.Option<Chat>>
    /** Returns the user's chats, the most recently updated first. */
    readonly selectSummaries: (userId: UserId) => Effect.Effect<ReadonlyArray<ChatSummary>>
    readonly selectDetail: (where: ChatOneWhere) => Effect.Effect<Option.Option<ChatDetail>>
    /** Removes the chat with its messages; dies while one of them has an attachment. */
    readonly delete: (id: ChatId) => Effect.Effect<void>
  }
>()('@app-template/domain/chat/ChatRepository') {}
