import { and, eq } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema, UndefinedOr } from 'effect'

import {
  isActiveMessage,
  type MessageOneWhere,
  MessageRepository,
  type MessageWhere,
} from '@app-template/domain/chat'

import { MessageDetailFromRow } from '#infrastructure/attachment/attachment.entity'
import {
  activeMessage,
  activeMessageFilter,
  inCreationOrder,
  MessageFromRow,
  MessageInsert,
  messages,
  withAttachments,
} from '#infrastructure/chat/message.entity'
import { buildWhere, skipUndefined } from '#infrastructure/db/columns'
import { Db, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeMessage = Schema.encodeEffect(MessageInsert)

const decodeOptionalMessage = Schema.decodeEffect(Schema.OptionFromUndefinedOr(MessageFromRow))

const decodeOptionalDetail = Schema.decodeEffect(Schema.OptionFromUndefinedOr(MessageDetailFromRow))

const decodeDetails = Schema.decodeEffect(Schema.Array(MessageDetailFromRow))

const encodeWhere = buildWhere<MessageWhere>({
  stage: (stage) => eq(messages.stage, stage),
})

/** The chat's `userId` is a filter on the relation, so another user's message reads as absent. */
const filterOf = (where: MessageOneWhere) =>
  ({
    id: where.id,
    chatId: skipUndefined(where.chatId),
    chat: skipUndefined(UndefinedOr.map(where.userId, (userId) => ({ userId }))),
  }) as const

export const MessageRepositoryPg = Layer.effect(
  MessageRepository,
  Db.useSync((db) =>
    MessageRepository.of({
      insert: Effect.fn('MessageRepository.insert')(function* (message) {
        const row = yield* encodeMessage(message)
        const inserted = yield* db
          .insert(messages)
          .values(row)
          .onConflictDoNothing({ target: messages.chatId, where: activeMessage })
          .returning({ id: messages.id })
        return Arr.isReadonlyArrayNonEmpty(inserted)
      }, orDieWithSqlError),
      update: Effect.fn('MessageRepository.update')(function* (message, where) {
        const row = yield* encodeMessage(message)
        const updated = yield* db
          .update(messages)
          .set(row)
          .where(and(eq(messages.id, message.id), encodeWhere(where)))
          .returning({ id: messages.id })
        return Arr.isReadonlyArrayNonEmpty(updated)
      }, orDieWithSqlError),
      selectOne: Effect.fn('MessageRepository.selectOne')(function* (where) {
        const row = yield* db.query.messages.findFirst({ where: filterOf(where) })
        return yield* decodeOptionalMessage(row)
      }, orDieWithSqlError),
      selectDetail: Effect.fn('MessageRepository.selectDetail')(function* (where) {
        const row = yield* db.query.messages.findFirst({
          where: filterOf(where),
          with: withAttachments,
        })
        return yield* decodeOptionalDetail(row)
      }, orDieWithSqlError),
      selectByChat: Effect.fn('MessageRepository.selectByChat')(function* (chatId) {
        const rows = yield* db.query.messages.findMany({
          where: { chatId },
          orderBy: inCreationOrder,
          with: withAttachments,
        })
        return yield* decodeDetails(rows)
      }, orDieWithSqlError),
      existsByChat: Effect.fn('MessageRepository.existsByChat')(function* (chatId) {
        const row = yield* db.query.messages.findFirst({
          where: { chatId },
          columns: { id: true },
        })
        return row !== undefined
      }, orDieWithSqlError),
      selectActiveByChat: Effect.fn('MessageRepository.selectActiveByChat')(function* (chatId) {
        const row = yield* db.query.messages.findFirst({
          where: { chatId, ...activeMessageFilter },
        })
        const found = yield* decodeOptionalMessage(row)
        return Option.filter(found, isActiveMessage)
      }, orDieWithSqlError),
    }),
  ),
)
