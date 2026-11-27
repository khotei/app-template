import { Array as Arr, Context, Effect, Layer, Option, Struct } from 'effect'

import { DbFilter, DbQuery } from '@app-template/packages/db'

import {
  type ChatEntity,
  type ChatEntitySelectWhere,
  type ChatEntitySet,
  type ChatEntityWhere,
  ChatRow,
} from '#kernel/data/chat/chat.entity'
import { type ChatColumns, chats } from '#kernel/data/chat/chat.table'
import { RowOrder } from '#kernel/data/data-order'
import { Db } from '#kernel/data/db.client'

/** Every read nests the chat's newest Run. */
const withNewestRun = { run: { orderBy: RowOrder.newestFirst } } as const

export class ChatRepository extends Context.Service<
  ChatRepository,
  {
    readonly insert: (chat: ChatColumns) => Effect.Effect<void>
    /** Writes the fields of `set` a chat may change on the chat `where` finds; dies when it writes nothing. */
    readonly update: (set: ChatEntitySet, where: ChatEntityWhere) => Effect.Effect<void>
    readonly selectOne: (where: ChatEntitySelectWhere) => Effect.Effect<Option.Option<ChatEntity>>
    /** Rows where `where` holds, the newest created first, then the greater id. */
    readonly selectMany: (where: ChatEntitySelectWhere) => Effect.Effect<ReadonlyArray<ChatEntity>>
    /**
     * Removes the chat `where` finds with its messages and Runs, in one statement; dies when it
     * removes nothing.
     */
    readonly delete: (where: ChatEntityWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/chat/ChatRepository', {
  make: Effect.gen(function* () {
    const db = yield* Db
    return {
      insert: Effect.fn('ChatRepository.insert')(
        (chat) => db.insert(chats).values(chat),
        DbQuery.orDie,
      ),
      update: Effect.fn('ChatRepository.update')(
        (set, where) =>
          db
            .update(chats)
            .set(Struct.pick(set, ChatRow.setColumns))
            .where(DbFilter.encode(chats, where))
            .returning({ id: chats.id }),
        Effect.filterOrFail(Arr.isReadonlyArrayNonEmpty),
        Effect.asVoid,
        DbQuery.orDie,
      ),
      selectOne: Effect.fn('ChatRepository.selectOne')(
        (where) => db.query.chats.findFirst({ where, with: withNewestRun }),
        Effect.map(Option.fromUndefinedOr),
        DbQuery.orDie,
      ),
      selectMany: Effect.fn('ChatRepository.selectMany')(
        (where) =>
          db.query.chats.findMany({
            where,
            with: withNewestRun,
            orderBy: RowOrder.newestFirst,
          }),
        DbQuery.orDie,
      ),
      delete: Effect.fn('ChatRepository.delete')(
        (where) =>
          db.delete(chats).where(DbFilter.encode(chats, where)).returning({ id: chats.id }),
        Effect.filterOrFail(Arr.isReadonlyArrayNonEmpty),
        Effect.asVoid,
        DbQuery.orDie,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
