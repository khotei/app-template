import { and, eq } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Schema, UndefinedOr } from 'effect'

import {
  MessageRepository,
  type MessageUpdateWhere,
  type MessageWhere,
} from '@app-template/domain/chat'

import { MessageFromRow } from '#infrastructure/attachment/attachment.entity'
import {
  activeMessage,
  inCreationOrder,
  MessageInsert,
  messages,
  withAttachments,
} from '#infrastructure/chat/message.entity'
import { buildWhere, skipUndefined } from '#infrastructure/db/columns'
import {
  Db,
  decodeOptionalRow,
  orDieOnNoRows,
  orDieWithSqlError,
} from '#infrastructure/db/db.client'

const encodeMessage = Schema.encodeEffect(MessageInsert)

const decodeMessages = Schema.decodeEffect(Schema.Array(MessageFromRow))

const encodeWhere = buildWhere<MessageUpdateWhere>({
  status: (status) => eq(messages.status, status),
})

/** The chat's `userId` is a filter on the relation, so another user's message reads as absent. */
const filterOf = (where: MessageWhere) =>
  ({
    id: skipUndefined(where.id),
    chatId: skipUndefined(where.chatId),
    status: skipUndefined(
      UndefinedOr.map(where.status, (statuses) => ({ in: Arr.copy(statuses) })),
    ),
    chat: skipUndefined(UndefinedOr.map(where.userId, (userId) => ({ userId }))),
  }) as const

export const MessageRepositoryPg = Layer.effect(
  MessageRepository,
  Db.useSync((db) =>
    MessageRepository.of({
      insert: Effect.fn('MessageRepository.insert')(function* (message) {
        const row = yield* encodeMessage(message)
        yield* db
          .insert(messages)
          .values(row)
          .onConflictDoNothing({ target: messages.chatId, where: activeMessage })
          .returning({ id: messages.id })
          .pipe(orDieOnNoRows(`message ${message.id} was not inserted`))
      }, orDieWithSqlError),
      update: Effect.fn('MessageRepository.update')(function* (message, where) {
        const row = yield* encodeMessage(message)
        yield* db
          .update(messages)
          .set(row)
          .where(and(eq(messages.id, message.id), encodeWhere(where)))
          .returning({ id: messages.id })
          .pipe(orDieOnNoRows(`message ${message.id} was not updated`))
      }, orDieWithSqlError),
      selectOne: Effect.fn('MessageRepository.selectOne')(
        (where) =>
          db.query.messages
            .findFirst({ where: filterOf(where), orderBy: inCreationOrder, with: withAttachments })
            .pipe(Effect.flatMap(decodeOptionalRow(MessageFromRow))),
        orDieWithSqlError,
      ),
      selectMany: Effect.fn('MessageRepository.selectMany')(
        (where) =>
          db.query.messages
            .findMany({
              where: filterOf(where),
              orderBy: inCreationOrder,
              with: withAttachments,
            })
            .pipe(Effect.flatMap(decodeMessages)),
        orDieWithSqlError,
      ),
    }),
  ),
)
