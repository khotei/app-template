import { and, eq, isNull, type SQL } from 'drizzle-orm'
import { Array as Arr, DateTime, Effect, Layer, Option, Schema, Struct } from 'effect'

import {
  type ChatId,
  ChatRepository,
  type ChatSet,
  type ChatWhere,
} from '@app-template/domain/chat'

import { ChatInsert, chats, decodeChat } from '#infrastructure/chat/chat.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeChat = Schema.encodeEffect(ChatInsert)

type ChatColumns = Partial<typeof chats.$inferInsert>

const noColumns: ChatColumns = {}

/** A table of one row per field of `F`, each turning the field's value into `Out`. */
type FieldTable<F, Out> = {
  readonly [K in keyof F]-?: (value: Exclude<F[K], undefined>) => Out
}

/** Runs the table's row for each field `value` holds, walking the table, so none is ignored. */
const fromFields = <F extends object, Out>(
  value: F,
  table: FieldTable<F, Out>,
): ReadonlyArray<Out> =>
  Arr.getSomes(
    Arr.map(Struct.keys(table), (key) =>
      Option.map(Option.fromUndefinedOr(value[key]), table[key]),
    ),
  )

const setColumns = {
  title: (title) => ({ title: Option.getOrNull(title) }),
  updatedAt: (updatedAt) => ({ updatedAt: DateTime.toDateUtc(updatedAt) }),
} as const satisfies FieldTable<ChatSet, ChatColumns>

const whereColumns = {
  id: (id) => eq(chats.id, id),
  title: Option.match({
    onNone: () => isNull(chats.title),
    onSome: (title) => eq(chats.title, title),
  }),
} as const satisfies FieldTable<ChatWhere, SQL>

export const ChatRepositoryPg = Layer.effect(
  ChatRepository,
  Effect.map(Db, (db) =>
    ChatRepository.of({
      insert: Effect.fn('ChatRepository.insert')(function* (chat) {
        const row = yield* encodeChat(chat)
        yield* db.insert(chats).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('ChatRepository.update')(function* (set, where) {
        const row = Arr.reduce(
          fromFields<ChatSet, ChatColumns>(set, setColumns),
          noColumns,
          (columns, column) => ({
            ...columns,
            ...column,
          }),
        )
        const updated = yield* db
          .update(chats)
          .set(row)
          .where(and(...fromFields<ChatWhere, SQL>(where, whereColumns)))
          .returning({ id: chats.id })
        return Arr.isReadonlyArrayNonEmpty(updated)
      }, orDieWithSqlError),
      selectById: Effect.fn('ChatRepository.selectById')(function* (id) {
        const row = yield* db.query.chats.findFirst({ where: { id } })
        return yield* decodeFound(row, decodeChat)
      }, orDieWithSqlError),
      selectByUser: Effect.fn('ChatRepository.selectByUser')(function* (userId) {
        const rows = yield* db.query.chats.findMany({ where: { userId } })
        return yield* Effect.forEach(rows, decodeChat)
      }, orDieWithSqlError),
      delete: Effect.fn('ChatRepository.delete')(
        (id: ChatId) => db.delete(chats).where(eq(chats.id, id)),
        orDieWithSqlError,
      ),
    }),
  ),
)
