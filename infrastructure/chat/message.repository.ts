import { and, eq } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema } from 'effect'

import { isActiveMessage, MessageRepository, type MessageWhere } from '@app-template/domain/chat'

import { decodeMessageDetail } from '#infrastructure/attachment/attachment.entity'
import {
  activeMessage,
  activeMessageFilter,
  decodeMessage,
  inCreationOrder,
  MessageInsert,
  messages,
  withAttachments,
} from '#infrastructure/chat/message.entity'
import { buildWhere } from '#infrastructure/db/columns'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeMessage = Schema.encodeEffect(MessageInsert)

const encodeWhere = buildWhere<MessageWhere>({
  stage: (stage) => eq(messages.stage, stage),
})

export const MessageRepositoryPg = Layer.effect(
  MessageRepository,
  Effect.map(Db, (db) =>
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
      selectById: Effect.fn('MessageRepository.selectById')(function* (id) {
        const row = yield* db.query.messages.findFirst({ where: { id } })
        return yield* decodeFound(row, decodeMessage)
      }, orDieWithSqlError),
      selectDetail: Effect.fn('MessageRepository.selectDetail')(function* (id) {
        const row = yield* db.query.messages.findFirst({ where: { id }, with: withAttachments })
        return yield* decodeFound(row, decodeMessageDetail)
      }, orDieWithSqlError),
      selectByChat: Effect.fn('MessageRepository.selectByChat')(function* (chatId) {
        const rows = yield* db.query.messages.findMany({
          where: { chatId },
          orderBy: inCreationOrder,
          with: withAttachments,
        })
        return yield* Effect.forEach(rows, decodeMessageDetail)
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
        const found = yield* decodeFound(row, decodeMessage)
        return Option.filter(found, isActiveMessage)
      }, orDieWithSqlError),
    }),
  ),
)
