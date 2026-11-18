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
  type ChatEntitySet,
  type ChatEntityWhere,
  chatSetColumns,
} from '#kernel/data/chat/chat.entity'
import { type ChatColumns, chats } from '#kernel/data/chat/chat.table'
import { withAttachments } from '#kernel/data/chat/message.entity'
import { newestFirst } from '#kernel/data/chat/run.entity'
import { Db } from '#kernel/data/db.client'

// Built on the table a query names: a relational query aliases `chats`, so a condition on the
// `chats` constant would reference a table the query does not have.
const encodeWhere = (table: typeof chats) =>
  buildWhere<ChatEntityWhere>({
    id: UndefinedOr.map((id) => eq(table.id, id)),
    userId: UndefinedOr.map((userId) => eq(table.userId, userId)),
    title: UndefinedOr.map(eqOrIsNull(table.title)),
  })

const select = (where: ChatEntityWhere) =>
  ({
    where: { RAW: (table: typeof chats) => skipUndefined(encodeWhere(table)(where)) },
    with: { ...withAttachments, run: { orderBy: newestFirst } },
  }) as const

export class ChatRepository extends Context.Service<
  ChatRepository,
  {
    readonly insert: (chat: ChatColumns) => Effect.Effect<void>
    /** Writes the fields of `set` a chat may change where `where` holds; dies when it writes nothing. */
    readonly update: (set: ChatEntitySet, where: ChatEntityWhere) => Effect.Effect<void>
    readonly selectOne: (where: ChatEntityWhere) => Effect.Effect<Option.Option<ChatEntity>>
    /** Rows where `where` holds, the newest created first. */
    readonly selectMany: (where: ChatEntityWhere) => Effect.Effect<ReadonlyArray<ChatEntity>>
    /**
     * Removes the chats `where` finds with their messages and attachments, in one statement; dies
     * when it removes nothing.
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
              .returning({ id: chats.id })
              .pipe(orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no chat was updated')),
          orDieWithSqlError,
        ),
        selectOne: Effect.fn('ChatRepository.selectOne')(
          (where) =>
            db.query.chats.findFirst(select(where)).pipe(Effect.map(Option.fromUndefinedOr)),
          orDieWithSqlError,
        ),
        selectMany: Effect.fn('ChatRepository.selectMany')(
          (where) => db.query.chats.findMany({ ...select(where), orderBy: { createdAt: 'desc' } }),
          orDieWithSqlError,
        ),
        delete: Effect.fn('ChatRepository.delete')(
          (where) =>
            db
              .delete(chats)
              .where(encodeWhere(chats)(where))
              .returning({ id: chats.id })
              .pipe(orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no chat was deleted')),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
