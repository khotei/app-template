import { Context, type Effect, type Option, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { ChatId } from '#domain/chat/chat.id'
import type { Chat } from '#domain/chat/chat.model'

/** The fields a write may change; `userId` and `createdAt` never change. */
export type ChatSet = Types.Simplify<
  RequireAtLeastOne<Pick<Chat, 'title' | 'status' | 'updatedAt'>>
>

/** The row found by `id`; every other field named must still hold, so an owner mismatch reads as absent. */
export type ChatWhere = Types.Simplify<
  { readonly id: ChatId } & Partial<Pick<Chat, 'userId' | 'title' | 'status'>>
>

/** The user's chats. */
export type ChatSelectManyWhere = Pick<Chat, 'userId'>

export class ChatRepository extends Context.Service<
  ChatRepository,
  {
    readonly insert: (chat: Chat) => Effect.Effect<void>
    /** Writes `set` where `where` holds; dies when it writes nothing. */
    readonly update: (set: ChatSet, where: ChatWhere) => Effect.Effect<void>
    readonly selectOne: (where: ChatWhere) => Effect.Effect<Option.Option<Chat>>
    /** Rows where `where` holds, the newest created first. */
    readonly selectMany: (where: ChatSelectManyWhere) => Effect.Effect<ReadonlyArray<Chat>>
    /**
     * Removes the chat `where` finds with its messages and their attachments, in one statement;
     * dies when it removes nothing.
     */
    readonly delete: (where: ChatWhere) => Effect.Effect<void>
  }
>()('@app-template/domain/chat/ChatRepository') {}
