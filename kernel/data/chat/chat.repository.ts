import { eq } from 'drizzle-orm'
import { Array as Arr, Context, Effect, Layer, Option, Struct, UndefinedOr } from 'effect'

import {
  buildWhere,
  eqOrIsNull,
  orDieUnless,
  orDieWithSqlError,
  skipUndefined,
} from '@app-template/packages/db'

import {
  type ChatEntity,
  type ChatEntitySelectWhere,
  type ChatEntitySet,
  type ChatEntityWhere,
  chatSetColumns,
} from '#kernel/data/chat/chat.entity'
import { type ChatColumns, chats } from '#kernel/data/chat/chat.table'
import { newestFirst } from '#kernel/data/chat/run.entity'
import { Db } from '#kernel/data/db.client'

// Built on the table a query names: a relational query aliases `chats`, so a condition on the
// `chats` constant would reference a table the query does not have.
const encodeWhere = (table: typeof chats) =>
  buildWhere<ChatEntitySelectWhere>({
    id: UndefinedOr.map((id) => eq(table.id, id)),
    userId: UndefinedOr.map((userId) => eq(table.userId, userId)),
    title: UndefinedOr.map(eqOrIsNull(table.title)),
  })

const select = (where: ChatEntitySelectWhere) =>
  ({
    where: { RAW: (table: typeof chats) => skipUndefined(encodeWhere(table)(where)) },
    with: { run: { orderBy: newestFirst } },
  }) as const

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
>()('@app-template/kernel/data/chat/ChatRepository') {
  static readonly layer = Layer.effect(
    this,
    Db.useSync((db) =>
      this.of({
        insert: Effect.fn('ChatRepository.insert')(
          (chat) => db.insert(chats).values(chat),
          orDieWithSqlError,
        ),
        update: Effect.fn('ChatRepository.update')(
          (set, where) =>
            db
              .update(chats)
              .set(Struct.pick(set, chatSetColumns))
              .where(encodeWhere(chats)(where))
              .returning({ id: chats.id }),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no chat was updated'),
          orDieWithSqlError,
        ),
        selectOne: Effect.fn('ChatRepository.selectOne')(
          (where) => db.query.chats.findFirst(select(where)),
          Effect.map(Option.fromUndefinedOr),
          orDieWithSqlError,
        ),
        selectMany: Effect.fn('ChatRepository.selectMany')(
          (where) => db.query.chats.findMany({ ...select(where), orderBy: newestFirst }),
          orDieWithSqlError,
        ),
        delete: Effect.fn('ChatRepository.delete')(
          (where) => db.delete(chats).where(encodeWhere(chats)(where)).returning({ id: chats.id }),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no chat was deleted'),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
