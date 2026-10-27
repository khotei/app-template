import { and, eq, type SQL } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema, Struct } from 'effect'

import { isActiveMessage, MessageRepository, type MessageWhere } from '@app-template/domain/chat'

import { type AttachmentRow, decodeAttachment } from '#infrastructure/attachment/attachment.entity'
import {
  activeMessage,
  activeMessageFilter,
  decodeMessage,
  MessageInsert,
  type MessageRow,
  messages,
} from '#infrastructure/chat/message.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeMessage = Schema.encodeEffect(MessageInsert)

const whereColumns = {
  stage: (stage) => eq(messages.stage, stage),
} as const satisfies { readonly [K in keyof MessageWhere]: (value: MessageWhere[K]) => SQL }

export const inCreationOrder = { createdAt: 'asc', id: 'asc' } as const

export const withAttachments = {
  attachments: { orderBy: { createdAt: 'asc', id: 'asc' } },
} as const

export type MessageDetailRow = typeof MessageRow.Encoded & {
  readonly attachments: ReadonlyArray<typeof AttachmentRow.Encoded>
}

export const decodeMessageDetail = ({ attachments, ...row }: MessageDetailRow) =>
  Effect.all({
    message: decodeMessage(row),
    attachments: Effect.forEach(attachments, decodeAttachment),
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
          .where(
            and(
              eq(messages.id, message.id),
              ...Arr.map(Struct.keys(whereColumns), (key) => whereColumns[key](where[key])),
            ),
          )
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
        const row = yield* db.query.chats.findFirst({
          where: { id: chatId, messages: true },
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
