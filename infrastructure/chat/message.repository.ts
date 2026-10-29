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
import { Db, decodeOptionalRow, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeMessage = Schema.encodeEffect(MessageInsert)

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
        if (Arr.isReadonlyArrayEmpty(inserted)) {
          return yield* Effect.die(new Error(`message ${message.id} was not inserted`))
        }
      }, orDieWithSqlError),
      update: Effect.fn('MessageRepository.update')(function* (message, where) {
        const row = yield* encodeMessage(message)
        const updated = yield* db
          .update(messages)
          .set(row)
          .where(and(eq(messages.id, message.id), encodeWhere(where)))
          .returning({ id: messages.id })
        if (Arr.isReadonlyArrayEmpty(updated)) {
          return yield* Effect.die(new Error(`message ${message.id} was not updated`))
        }
      }, orDieWithSqlError),
      selectOne: Effect.fn('MessageRepository.selectOne')(
        (where) =>
          db.query.messages
            .findFirst({ where: filterOf(where) })
            .pipe(Effect.flatMap(decodeOptionalRow(MessageFromRow))),
        orDieWithSqlError,
      ),
      selectDetail: Effect.fn('MessageRepository.selectDetail')(
        (where) =>
          db.query.messages
            .findFirst({ where: filterOf(where), with: withAttachments })
            .pipe(Effect.flatMap(decodeOptionalRow(MessageDetailFromRow))),
        orDieWithSqlError,
      ),
      selectByChat: Effect.fn('MessageRepository.selectByChat')(
        (chatId) =>
          db.query.messages
            .findMany({ where: { chatId }, orderBy: inCreationOrder, with: withAttachments })
            .pipe(Effect.flatMap(decodeDetails)),
        orDieWithSqlError,
      ),
      existsByChat: Effect.fn('MessageRepository.existsByChat')(function* (chatId) {
        const row = yield* db.query.messages.findFirst({
          where: { chatId },
          columns: { id: true },
        })
        return row !== undefined
      }, orDieWithSqlError),
      selectActiveByChat: Effect.fn('MessageRepository.selectActiveByChat')(
        (chatId) =>
          db.query.messages
            .findFirst({ where: { chatId, ...activeMessageFilter } })
            .pipe(
              Effect.flatMap(decodeOptionalRow(MessageFromRow)),
              Effect.map(Option.filter(isActiveMessage)),
            ),
        orDieWithSqlError,
      ),
    }),
  ),
)
