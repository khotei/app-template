import { eq, inArray } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { Context, Effect, Layer, type Option, Schema, UndefinedOr } from 'effect'

import {
  buildWhere,
  decodeOptionalRow,
  orDieWithSqlError,
  skipUndefined,
} from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'
import {
  inCreationOrder,
  type MessageEntity,
  MessageEntityFromRead,
  type MessageEntityInsert,
  type MessageEntityWhere,
  withAttachments,
  withRun,
} from '#kernel/data/chat/message.entity'
import { messages } from '#kernel/data/chat/message.table'
import { Db } from '#kernel/data/db.client'

// Built on the table a query names, as a relational query aliases `messages`; `userId` is the
// owner of the row's chat, so a message of another user's chat reads as absent.
const encodeWhere = (table: typeof messages) =>
  buildWhere<MessageEntityWhere>({
    id: UndefinedOr.map((id) => eq(table.id, id)),
    chatId: UndefinedOr.map((chatId) => eq(table.chatId, chatId)),
    userId: UndefinedOr.map((userId) =>
      inArray(
        table.chatId,
        new QueryBuilder().select({ id: chats.id }).from(chats).where(eq(chats.userId, userId)),
      ),
    ),
  })

const select = (where: MessageEntityWhere) =>
  ({
    where: { RAW: (table: typeof messages) => skipUndefined(encodeWhere(table)(where)) },
    orderBy: inCreationOrder,
    with: { ...withAttachments, ...withRun },
  }) as const

const decodeMessages = Schema.decodeEffect(Schema.Array(MessageEntityFromRead))

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /** Writes the message's own fields, never its attachments; a message is never changed. */
    readonly insert: (message: typeof MessageEntityInsert.Type) => Effect.Effect<void>
    /** Returns the first row in creation order where `where` holds. */
    readonly selectOne: (where: MessageEntityWhere) => Effect.Effect<Option.Option<MessageEntity>>
    /** Returns the rows where `where` holds, in creation order, a tie broken by id. */
    readonly selectMany: (where: MessageEntityWhere) => Effect.Effect<ReadonlyArray<MessageEntity>>
  }
>()('@app-template/kernel/data/chat/MessageRepository') {
  static readonly layer = Layer.effect(
    this,
    Db.useSync((db) =>
      this.of({
        insert: Effect.fn('MessageRepository.insert')(
          (message) => db.insert(messages).values(message),
          orDieWithSqlError,
        ),
        selectOne: Effect.fn('MessageRepository.selectOne')(
          (where) =>
            db.query.messages
              .findFirst(select(where))
              .pipe(Effect.flatMap(decodeOptionalRow(MessageEntityFromRead))),
          orDieWithSqlError,
        ),
        selectMany: Effect.fn('MessageRepository.selectMany')(
          (where) => db.query.messages.findMany(select(where)).pipe(Effect.flatMap(decodeMessages)),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
