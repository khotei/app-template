import { eq, isNull } from 'drizzle-orm'
import { Array as Arr, DateTime, Effect, Layer, Option, Schema, UndefinedOr } from 'effect'

import {
  type ChatId,
  ChatRepository,
  type ChatSet,
  type ChatWhere,
  isActiveMessage,
} from '@app-template/domain/chat'

import {
  decodeMessageDetail,
  type MessageDetailRow,
} from '#infrastructure/attachment/attachment.entity'
import { ChatInsert, type ChatRow, chats, decodeChat } from '#infrastructure/chat/chat.entity'
import {
  activeMessageFilter,
  decodeMessage,
  inCreationOrder,
  type MessageRow,
  withAttachments,
} from '#infrastructure/chat/message.entity'
import { buildSet, buildWhere, skipUndefined } from '#infrastructure/db/columns'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

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

/** `encodeWhere` for a relational read, which aliases the table and so takes a filter object. */
const filterOf = (where: ChatWhere) =>
  ({
    id: where.id,
    userId: skipUndefined(where.userId),
    title: skipUndefined(
      UndefinedOr.map(
        where.title,
        Option.getOrElse(() => ({ isNull: true }) as const),
      ),
    ),
  }) as const

const decodeSummary = ({
  messages,
  ...row
}: typeof ChatRow.Encoded & { readonly messages: ReadonlyArray<typeof MessageRow.Encoded> }) =>
  Effect.all({
    chat: decodeChat(row),
    activeMessage: Effect.map(
      decodeFound(messages[0], decodeMessage),
      Option.filter(isActiveMessage),
    ),
  })

const decodeDetail = ({
  messages,
  ...row
}: typeof ChatRow.Encoded & { readonly messages: ReadonlyArray<MessageDetailRow> }) =>
  Effect.gen(function* () {
    const chat = yield* decodeChat(row)
    const details = yield* Effect.forEach(messages, decodeMessageDetail)
    const activeMessage = Arr.findFirst(
      Arr.map(details, (detail) => detail.message),
      isActiveMessage,
    )
    return { chat, activeMessage, messages: details }
  })

export const ChatRepositoryPg = Layer.effect(
  ChatRepository,
  Effect.map(Db, (db) =>
    ChatRepository.of({
      insert: Effect.fn('ChatRepository.insert')(function* (chat) {
        const row = yield* encodeChat(chat)
        yield* db.insert(chats).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('ChatRepository.update')(function* (set, where) {
        const updated = yield* db
          .update(chats)
          .set(encodeSet(set))
          .where(encodeWhere(where))
          .returning({ id: chats.id })
        return Arr.isReadonlyArrayNonEmpty(updated)
      }, orDieWithSqlError),
      selectOne: Effect.fn('ChatRepository.selectOne')(function* (where) {
        const row = yield* db.query.chats.findFirst({ where: filterOf(where) })
        return yield* decodeFound(row, decodeChat)
      }, orDieWithSqlError),
      selectSummaries: Effect.fn('ChatRepository.selectSummaries')(function* (userId) {
        const rows = yield* db.query.chats.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          with: { messages: { where: activeMessageFilter, limit: 1 } },
        })
        return yield* Effect.forEach(rows, decodeSummary)
      }, orDieWithSqlError),
      selectDetail: Effect.fn('ChatRepository.selectDetail')(function* (where) {
        const row = yield* db.query.chats.findFirst({
          where: filterOf(where),
          with: { messages: { orderBy: inCreationOrder, with: withAttachments } },
        })
        return yield* decodeFound(row, decodeDetail)
      }, orDieWithSqlError),
      delete: Effect.fn('ChatRepository.delete')(
        (id: ChatId) => db.delete(chats).where(eq(chats.id, id)),
        orDieWithSqlError,
      ),
    }),
  ),
)
