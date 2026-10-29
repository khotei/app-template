import { eq, isNull } from 'drizzle-orm'
import {
  Array as Arr,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema,
  SchemaGetter,
  UndefinedOr,
} from 'effect'

import {
  Chat,
  type ChatDetail,
  type ChatId,
  type ChatOneWhere,
  ChatRepository,
  type ChatSet,
  type ChatSummary,
  type ChatWhere,
  isActiveMessage,
  Message,
} from '@app-template/domain/chat'

import { MessageDetailFromRow } from '#infrastructure/attachment/attachment.entity'
import { ChatFromRow, ChatInsert, ChatRow, chats } from '#infrastructure/chat/chat.entity'
import {
  activeMessageFilter,
  inCreationOrder,
  MessageRow,
  withAttachments,
} from '#infrastructure/chat/message.entity'
import { buildSet, buildWhere, skipUndefined } from '#infrastructure/db/columns'
import { Db, orDieWithSqlError } from '#infrastructure/db/db.client'

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

const decodeOptionalChat = Schema.decodeEffect(Schema.OptionFromUndefinedOr(ChatFromRow))

/** A chat row with at most one message nested, its active one; decode only. */
const ChatSummaryFromRow = Schema.Struct({
  ...ChatRow.fields,
  messages: Schema.Array(MessageRow),
}).pipe(
  Schema.decodeTo(Schema.Struct({ chat: Chat, message: Schema.Option(Message) }), {
    decode: SchemaGetter.transform(({ messages, ...chat }) => ({
      chat,
      message: Arr.head(messages),
    })),
    encode: SchemaGetter.forbiddenEncoding,
  }),
)

const decodeSummaries = Schema.decodeEffect(Schema.Array(ChatSummaryFromRow))

const toSummary = ({ chat, message }: typeof ChatSummaryFromRow.Type): ChatSummary => ({
  chat,
  activeMessage: Option.filter(message, isActiveMessage),
})

/** A chat row with every message nested, each with its attachments; decode only. */
const ChatDetailFromRow = Schema.Struct({
  ...ChatRow.fields,
  messages: Schema.Array(MessageDetailFromRow),
}).pipe(
  Schema.decodeTo(
    Schema.Struct({ chat: Chat, messages: Schema.Array(Schema.toType(MessageDetailFromRow)) }),
    {
      decode: SchemaGetter.transform(({ messages, ...chat }) => ({ chat, messages })),
      encode: SchemaGetter.forbiddenEncoding,
    },
  ),
)

const decodeOptionalDetail = Schema.decodeEffect(Schema.OptionFromUndefinedOr(ChatDetailFromRow))

const toDetail = ({ chat, messages }: typeof ChatDetailFromRow.Type): ChatDetail => ({
  chat,
  activeMessage: Arr.findFirst(
    Arr.map(messages, (detail) => detail.message),
    isActiveMessage,
  ),
  messages,
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
      selectOne: Effect.fn('ChatRepository.selectOne')(function* (where) {
        const row = yield* db.query.chats.findFirst({ where: filterOf(where) })
        return yield* decodeOptionalChat(row)
      }, orDieWithSqlError),
      selectSummaries: Effect.fn('ChatRepository.selectSummaries')(function* (userId) {
        const rows = yield* db.query.chats.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          with: { messages: { where: activeMessageFilter, limit: 1 } },
        })
        const summaries = yield* decodeSummaries(rows)
        return Arr.map(summaries, toSummary)
      }, orDieWithSqlError),
      selectDetail: Effect.fn('ChatRepository.selectDetail')(function* (where) {
        const row = yield* db.query.chats.findFirst({
          where: filterOf(where),
          with: { messages: { orderBy: inCreationOrder, with: withAttachments } },
        })
        const found = yield* decodeOptionalDetail(row)
        return Option.map(found, toDetail)
      }, orDieWithSqlError),
      delete: Effect.fn('ChatRepository.delete')(
        (id: ChatId) => db.delete(chats).where(eq(chats.id, id)),
        orDieWithSqlError,
      ),
    }),
  ),
)
