import { and, eq, type SQL } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema } from 'effect'

import {
  ActiveMessageStage,
  isActiveMessage,
  MessageRepository,
  type MessageStage,
  type MessageWhere,
} from '@app-template/domain/chat'

import {
  activeMessage,
  decodeMessage,
  MessageInsert,
  messages,
} from '#infrastructure/chat/message.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeMessage = Schema.encodeEffect(MessageInsert)

const whereColumns = {
  stage: (stage: MessageStage) => eq(messages.stage, stage),
} as const satisfies { readonly [K in keyof MessageWhere]: (value: MessageWhere[K]) => SQL }

const withAttachmentIds = {
  attachments: { columns: { id: true }, orderBy: { createdAt: 'asc', id: 'asc' } },
} as const

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
          .where(and(eq(messages.id, message.id), whereColumns.stage(where.stage)))
          .returning({ id: messages.id })
        return Arr.isReadonlyArrayNonEmpty(updated)
      }, orDieWithSqlError),
      selectById: Effect.fn('MessageRepository.selectById')(function* (id) {
        const row = yield* db.query.messages.findFirst({ where: { id }, with: withAttachmentIds })
        return yield* decodeFound(row, decodeMessage)
      }, orDieWithSqlError),
      selectByChat: Effect.fn('MessageRepository.selectByChat')(function* (chatId) {
        const rows = yield* db.query.messages.findMany({
          where: { chatId },
          orderBy: { createdAt: 'asc', id: 'asc' },
          with: withAttachmentIds,
        })
        return yield* Effect.forEach(rows, decodeMessage)
      }, orDieWithSqlError),
      selectActiveByChat: Effect.fn('MessageRepository.selectActiveByChat')(function* (chatId) {
        const row = yield* db.query.messages.findFirst({
          where: {
            chatId,
            author: 'assistant',
            stage: { in: Arr.copy(ActiveMessageStage.literals) },
          },
          with: withAttachmentIds,
        })
        const found = yield* decodeFound(row, decodeMessage)
        return Option.filter(found, isActiveMessage)
      }, orDieWithSqlError),
    }),
  ),
)
