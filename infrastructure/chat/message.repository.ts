import { eq } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema } from 'effect'

import {
  ActiveMessageStage,
  type ChatId,
  isActiveMessage,
  MessageRepository,
} from '@app-template/domain/chat'

import { decodeMessage, MessageInsert, messages } from '#infrastructure/chat/message.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeMessage = Schema.encodeEffect(MessageInsert)

const withAttachmentIds = {
  attachments: { columns: { id: true }, orderBy: { createdAt: 'asc', id: 'asc' } },
} as const

export const MessageRepositoryPg = Layer.effect(
  MessageRepository,
  Effect.map(Db, (db) =>
    MessageRepository.of({
      insert: Effect.fn('MessageRepository.insert')(function* (message) {
        const row = yield* encodeMessage(message)
        yield* db.insert(messages).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('MessageRepository.update')(function* (message) {
        const row = yield* encodeMessage(message)
        yield* db.update(messages).set(row).where(eq(messages.id, message.id))
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
      deleteByChat: Effect.fn('MessageRepository.deleteByChat')(
        (chatId: ChatId) => db.delete(messages).where(eq(messages.chatId, chatId)),
        orDieWithSqlError,
      ),
    }),
  ),
)
