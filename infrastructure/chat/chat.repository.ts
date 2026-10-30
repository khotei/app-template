import { desc, eq, isNull } from 'drizzle-orm'
import { Array as Arr, DateTime, Effect, flow, Layer, Option, Schema, UndefinedOr } from 'effect'
import { identity } from 'effect/Function'

import {
  type ChatManyWhere,
  ChatRepository,
  type ChatSet,
  type ChatWhere,
} from '@app-template/domain/chat'

import { ChatFromRow, ChatInsert, chats } from '#infrastructure/chat/chat.entity'
import { buildSet, buildWhere } from '#infrastructure/db/columns'
import {
  Db,
  decodeOptionalRow,
  orDieOnNoRows,
  orDieWithSqlError,
} from '#infrastructure/db/db.client'

const encodeChat = Schema.encodeEffect(ChatInsert)

const encodeSet = buildSet<ChatSet, typeof chats>({
  title: UndefinedOr.map(Option.getOrNull),
  status: identity,
  updatedAt: UndefinedOr.map(DateTime.toDateUtc),
})

const encodeWhere = buildWhere<ChatWhere>({
  id: (id) => eq(chats.id, id),
  userId: UndefinedOr.map((userId) => eq(chats.userId, userId)),
  title: UndefinedOr.map(
    Option.match({
      onNone: () => isNull(chats.title),
      onSome: (title) => eq(chats.title, title),
    }),
  ),
  status: UndefinedOr.map((status) => eq(chats.status, status)),
})

const encodeManyWhere = buildWhere<ChatManyWhere>({
  userId: (userId) => eq(chats.userId, userId),
  status: UndefinedOr.map((status) => eq(chats.status, status)),
})

const decodeChats = Schema.decodeEffect(Schema.Array(ChatFromRow))

export const ChatRepositoryPg = Layer.effect(
  ChatRepository,
  Db.useSync((db) =>
    ChatRepository.of({
      insert: Effect.fn('ChatRepository.insert')(function* (chat) {
        const row = yield* encodeChat(chat)
        yield* db.insert(chats).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('ChatRepository.update')(
        (set, where) =>
          db
            .update(chats)
            .set(encodeSet(set))
            .where(encodeWhere(where))
            .returning({ id: chats.id })
            .pipe(orDieOnNoRows(`chat ${where.id} was not updated`)),
        orDieWithSqlError,
      ),
      selectOne: Effect.fn('ChatRepository.selectOne')(
        (where) =>
          db
            .select()
            .from(chats)
            .where(encodeWhere(where))
            .pipe(
              Effect.map(flow(Arr.head, Option.getOrUndefined)),
              Effect.flatMap(decodeOptionalRow(ChatFromRow)),
            ),
        orDieWithSqlError,
      ),
      selectMany: Effect.fn('ChatRepository.selectMany')(
        (where, options) =>
          db
            .select()
            .from(chats)
            .where(encodeManyWhere(where))
            .orderBy(desc(chats[options?.order ?? 'createdAt']))
            .pipe(Effect.flatMap(decodeChats)),
        orDieWithSqlError,
      ),
      delete: Effect.fn('ChatRepository.delete')(
        (where) =>
          db
            .delete(chats)
            .where(encodeWhere(where))
            .returning({ id: chats.id })
            .pipe(orDieOnNoRows(`chat ${where.id} was not deleted`)),
        orDieWithSqlError,
      ),
    }),
  ),
)
