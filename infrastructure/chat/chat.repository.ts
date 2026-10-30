import { desc, eq, isNull } from 'drizzle-orm'
import { Array as Arr, DateTime, Effect, Layer, Option, Schema, UndefinedOr } from 'effect'

import {
  type ChatId,
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
      selectOne: Effect.fn('ChatRepository.selectOne')(function* (where, options) {
        const query = db.select().from(chats).where(encodeWhere(where)).$dynamic()
        const rows = yield* options?.forUpdate ? query.for('update') : query
        return yield* decodeOptionalRow(ChatFromRow)(Arr.head(rows).pipe(Option.getOrUndefined))
      }, orDieWithSqlError),
      selectByUser: Effect.fn('ChatRepository.selectByUser')(
        (userId) =>
          db
            .select()
            .from(chats)
            .where(eq(chats.userId, userId))
            .orderBy(desc(chats.updatedAt))
            .pipe(Effect.flatMap(decodeChats)),
        orDieWithSqlError,
      ),
      delete: Effect.fn('ChatRepository.delete')(
        (id: ChatId) =>
          db
            .delete(chats)
            .where(eq(chats.id, id))
            .returning({ id: chats.id })
            .pipe(orDieOnNoRows(`chat ${id} was not deleted`)),
        orDieWithSqlError,
      ),
    }),
  ),
)
