import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { Array as Arr, DateTime, Effect, Layer, Option, Schema, Struct, UndefinedOr } from 'effect'

import { ChatRepository, type ChatSet, type ChatWhere } from '@app-template/domain/chat'

import { ChatFromRow, ChatInsert, chats } from '#infrastructure/chat/chat.entity'
import { activeMessage, messages } from '#infrastructure/chat/message.entity'
import { buildSet, buildWhere } from '#infrastructure/db/columns'
import { Db, orDieOnNoRows, orDieWithSqlError } from '#infrastructure/db/db.client'

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
  Db.useSync((db) => {
    /**
     * The rows with their status, read by a statement of its own: after a `FOR UPDATE` that
     * waited, it sees the reply the lock's holder committed, which a subquery of the locking
     * statement, reading from that statement's start, would miss.
     */
    const decodeWithStatus = Effect.fnUntraced(function* (
      rows: ReadonlyArray<typeof chats.$inferSelect>,
    ) {
      if (Arr.isReadonlyArrayEmpty(rows)) return []

      const busy = yield* db
        .select({ chatId: messages.chatId })
        .from(messages)
        .where(and(inArray(messages.chatId, Arr.map(rows, Struct.get('id'))), activeMessage))
      const busyIds = Arr.map(busy, Struct.get('chatId'))
      return yield* decodeChats(
        Arr.map(rows, (row) => ({
          ...row,
          status: Arr.contains(busyIds, row.id) ? ('busy' as const) : ('idle' as const),
        })),
      )
    })

    return ChatRepository.of({
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
        return yield* decodeWithStatus(rows).pipe(Effect.map(Arr.head))
      }, orDieWithSqlError),
      selectByUser: Effect.fn('ChatRepository.selectByUser')(
        (userId) =>
          db
            .select()
            .from(chats)
            .where(eq(chats.userId, userId))
            .orderBy(desc(chats.updatedAt))
            .pipe(Effect.flatMap(decodeWithStatus)),
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
    })
  }),
)
