import { eq, isNull } from 'drizzle-orm'
import { Array as Arr, DateTime, Effect, flow, Layer, Option, Schema, UndefinedOr } from 'effect'

import {
  type ChatId,
  type ChatOneWhere,
  ChatRepository,
  type ChatSet,
  type ChatWhere,
  isActiveMessage,
} from '@app-template/domain/chat'

import { MessageDetailFromRow } from '#infrastructure/attachment/attachment.entity'
import { ChatFromRow, ChatInsert, chats } from '#infrastructure/chat/chat.entity'
import {
  activeMessageFilter,
  inCreationOrder,
  MessageFromRow,
  withAttachments,
} from '#infrastructure/chat/message.entity'
import { buildSet, buildWhere, skipUndefined } from '#infrastructure/db/columns'
import { Db, decodeOptionalRow, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeChat = Schema.encodeEffect(ChatInsert)

const encodeSet = buildSet<ChatSet, typeof chats>({
  title: UndefinedOr.map(Option.getOrNull),
  updatedAt: UndefinedOr.map(DateTime.toDateUtc),
})

const encodeWhere = buildWhere<ChatWhere>({
  id: (id) => eq(chats.id, id),
  title: UndefinedOr.map(
    Option.match({
      onNone: () => isNull(chats.title),
      onSome: (title) => eq(chats.title, title),
    }),
  ),
})

/** A relational read aliases the table, so it takes a filter object, not `buildWhere`. */
const filterOf = (where: ChatOneWhere) =>
  ({ id: where.id, userId: skipUndefined(where.userId) }) as const

const decodeChat = Schema.decodeEffect(ChatFromRow)

const decodeMessages = Schema.decodeEffect(Schema.Array(MessageFromRow))

const decodeDetails = Schema.decodeEffect(Schema.Array(MessageDetailFromRow))

type ChatRowWith<Nested> = typeof ChatFromRow.Encoded & { readonly messages: ReadonlyArray<Nested> }

const decodeSummary = ({ messages, ...row }: ChatRowWith<typeof MessageFromRow.Encoded>) =>
  Effect.all({
    chat: decodeChat(row),
    activeMessage: Effect.map(decodeMessages(messages), Arr.findFirst(isActiveMessage)),
  })

const decodeDetail = ({ messages, ...row }: ChatRowWith<typeof MessageDetailFromRow.Encoded>) =>
  Effect.gen(function* () {
    const chat = yield* decodeChat(row)
    const details = yield* decodeDetails(messages)
    const activeMessage = Arr.findFirst(details, ({ message }) =>
      Option.liftPredicate(message, isActiveMessage),
    )
    return { chat, activeMessage, messages: details }
  })

export const ChatRepositoryPg = Layer.effect(
  ChatRepository,
  Db.useSync((db) =>
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
      selectOne: Effect.fn('ChatRepository.selectOne')(
        (where) =>
          db.query.chats
            .findFirst({ where: filterOf(where) })
            .pipe(Effect.flatMap(decodeOptionalRow(ChatFromRow))),
        orDieWithSqlError,
      ),
      selectSummaries: Effect.fn('ChatRepository.selectSummaries')(
        (userId) =>
          db.query.chats
            .findMany({
              where: { userId },
              orderBy: { updatedAt: 'desc' },
              with: { messages: { where: activeMessageFilter, limit: 1 } },
            })
            .pipe(Effect.flatMap(Effect.forEach(decodeSummary))),
        orDieWithSqlError,
      ),
      selectDetail: Effect.fn('ChatRepository.selectDetail')(
        (where) =>
          db.query.chats
            .findFirst({
              where: filterOf(where),
              with: { messages: { orderBy: inCreationOrder, with: withAttachments } },
            })
            .pipe(
              Effect.flatMap(
                flow(Option.fromNullishOr, Option.map(decodeDetail), Effect.transposeOption),
              ),
            ),
        orDieWithSqlError,
      ),
      delete: Effect.fn('ChatRepository.delete')(
        (id: ChatId) => db.delete(chats).where(eq(chats.id, id)),
        orDieWithSqlError,
      ),
    }),
  ),
)
