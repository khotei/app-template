import { and, eq } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Schema, UndefinedOr } from 'effect'

import {
  type MessageManyWhere,
  type MessageOneWhere,
  MessageRepository,
  type MessageWhere,
} from '@app-template/domain/chat'

import { MessageDetailFromRow } from '#infrastructure/attachment/attachment.entity'
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

const decodeDetails = Schema.decodeEffect(Schema.Array(MessageDetailFromRow))

const encodeWhere = buildWhere<MessageWhere>({
  stage: (stage) => eq(messages.stage, stage),
})

/** The chat's `userId` is a filter on the relation, so another user's message reads as absent. */
const filterOf = (where: MessageOneWhere) =>
  ({
    id: skipUndefined(where.id),
    chatId: skipUndefined(where.chatId),
    chat: skipUndefined(UndefinedOr.map(where.userId, (userId) => ({ userId }))),
  }) as const

const filterOfMany = (where: MessageManyWhere) =>
  ({
    chatId: { in: Arr.copy(where.chatId) },
    author: skipUndefined(where.author),
    stage: skipUndefined(UndefinedOr.map(where.stage, (stages) => ({ in: Arr.copy(stages) }))),
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
            .pipe(Effect.flatMap(decodeOptionalRow(MessageDetailFromRow))),
        orDieWithSqlError,
      ),
      selectMany: Effect.fn('MessageRepository.selectMany')(
        (where) =>
          db.query.messages
            .findMany({
              where: filterOfMany(where),
              orderBy: inCreationOrder,
              with: withAttachments,
            })
            .pipe(Effect.flatMap(decodeDetails)),
        orDieWithSqlError,
      ),
    }),
  ),
)
