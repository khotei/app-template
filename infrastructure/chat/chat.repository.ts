import { eq, isNull } from 'drizzle-orm'
import { DateTime, Effect, Layer, Option, Schema, UndefinedOr } from 'effect'
import { identity } from 'effect/Function'

import {
  ChatRepository,
  type ChatSelectManyWhere,
  type ChatSet,
  type ChatWhere,
} from '@app-template/domain/chat'

import { ChatFromRow } from '#infrastructure/attachment/attachment.entity'
import { ChatInsert, chats } from '#infrastructure/chat/chat.entity'
import { withAttachments } from '#infrastructure/chat/message.entity'
import { buildSet, buildWhere, skipUndefined } from '#infrastructure/db/columns'
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

// Built on the table a query names: a relational query aliases `chats`, so a condition on the
// `chats` constant would reference a table the query does not have.
const encodeWhere = (table: typeof chats) =>
  buildWhere<ChatWhere>({
    id: (id) => eq(table.id, id),
    userId: UndefinedOr.map((userId) => eq(table.userId, userId)),
    title: UndefinedOr.map(
      Option.match({
        onNone: () => isNull(table.title),
        onSome: (title) => eq(table.title, title),
      }),
    ),
    status: UndefinedOr.map((status) => eq(table.status, status)),
  })

const encodeManyWhere = (table: typeof chats) =>
  buildWhere<ChatSelectManyWhere>({ userId: (userId) => eq(table.userId, userId) })

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
            .where(encodeWhere(chats)(where))
            .returning({ id: chats.id })
            .pipe(orDieOnNoRows(`chat ${where.id} was not updated`)),
        orDieWithSqlError,
      ),
      selectOne: Effect.fn('ChatRepository.selectOne')(
        (where) =>
          db.query.chats
            .findFirst({
              where: { RAW: (table) => skipUndefined(encodeWhere(table)(where)) },
              with: withAttachments,
            })
            .pipe(Effect.flatMap(decodeOptionalRow(ChatFromRow))),
        orDieWithSqlError,
      ),
      selectMany: Effect.fn('ChatRepository.selectMany')(
        (where) =>
          db.query.chats
            .findMany({
              where: { RAW: (table) => skipUndefined(encodeManyWhere(table)(where)) },
              orderBy: { createdAt: 'desc' },
              with: withAttachments,
            })
            .pipe(Effect.flatMap(decodeChats)),
        orDieWithSqlError,
      ),
      delete: Effect.fn('ChatRepository.delete')(
        (where) =>
          db
            .delete(chats)
            .where(encodeWhere(chats)(where))
            .returning({ id: chats.id })
            .pipe(orDieOnNoRows(`chat ${where.id} was not deleted`)),
        orDieWithSqlError,
      ),
    }),
  ),
)
