import { and, eq, isNull } from 'drizzle-orm'
import { Array as Arr, DateTime, Effect, Layer, Option, Schema, Struct, UndefinedOr } from 'effect'

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
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeChat = Schema.encodeEffect(ChatInsert)

const setColumns = {
  title: UndefinedOr.map(Option.getOrNull),
  updatedAt: UndefinedOr.map(DateTime.toDateUtc),
} as const satisfies { readonly [K in keyof Required<ChatSet>]: (value: ChatSet[K]) => unknown }

const whereColumns = {
  id: (id) => eq(chats.id, id),
  title: UndefinedOr.map(
    Option.match({
      onNone: () => isNull(chats.title),
      onSome: (title) => eq(chats.title, title),
    }),
  ),
} as const satisfies { readonly [K in keyof Required<ChatWhere>]: (value: ChatWhere[K]) => unknown }

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
        const row = Struct.evolve(Struct.pick(set, Struct.keys(setColumns)), setColumns)
        const conditions = Struct.evolve(
          Struct.pick(where, Struct.keys(whereColumns)),
          whereColumns,
        )

        const updated = yield* db
          .update(chats)
          .set(row)
          .where(and(...Object.values(conditions)))
          .returning({ id: chats.id })
        return Arr.isReadonlyArrayNonEmpty(updated)
      }, orDieWithSqlError),
      selectById: Effect.fn('ChatRepository.selectById')(function* (id) {
        const row = yield* db.query.chats.findFirst({ where: { id } })
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
      selectDetail: Effect.fn('ChatRepository.selectDetail')(function* (id) {
        const row = yield* db.query.chats.findFirst({
          where: { id },
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
