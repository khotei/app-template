import { eq, inArray } from 'drizzle-orm'
import { Array as Arr, Context, Effect, Layer, type Option, Schema, UndefinedOr } from 'effect'
import { identity } from 'effect/Function'

import {
  buildSet,
  buildWhere,
  decodeOptionalRow,
  orDieUnless,
  orDieWithSqlError,
  skipUndefined,
} from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'
import {
  inCreationOrder,
  MessageEntity,
  type MessageEntityInsert,
  type MessageEntitySet,
  type MessageEntityWhere,
  withAttachments,
} from '#kernel/data/chat/message.entity'
import { activeMessage, messages } from '#kernel/data/chat/message.table'
import { Db } from '#kernel/data/db.client'

const encodeSet = buildSet<MessageEntitySet, typeof messages>({
  status: identity,
  text: identity,
  error: identity,
  updatedAt: identity,
})

const decodeMessages = Schema.decodeEffect(Schema.Array(MessageEntity))

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /**
     * Writes the message's own fields, never its attachments; dies when it writes nothing: the
     * message is active and its chat already has one.
     */
    readonly insert: (message: typeof MessageEntityInsert.Type) => Effect.Effect<void>
    /** Writes the fields of `set` a message may change where `where` holds; dies when it writes nothing. */
    readonly update: (set: MessageEntitySet, where: MessageEntityWhere) => Effect.Effect<void>
    /** Returns the first row in creation order where `where` holds. */
    readonly selectOne: (where: MessageEntityWhere) => Effect.Effect<Option.Option<MessageEntity>>
    /** Returns the rows where `where` holds, in creation order, a tie broken by id. */
    readonly selectMany: (where: MessageEntityWhere) => Effect.Effect<ReadonlyArray<MessageEntity>>
  }
>()('@app-template/kernel/data/chat/MessageRepository') {
  static readonly layer = Layer.effect(
    this,
    Db.useSync((db) => {
      // Built on the table a query names, as a relational query aliases `messages`; `userId` is
      // the owner of the row's chat, so a message of another user's chat reads as absent.
      const encodeWhere = (table: typeof messages) =>
        buildWhere<MessageEntityWhere>({
          id: UndefinedOr.map((id) => eq(table.id, id)),
          chatId: UndefinedOr.map((chatId) => eq(table.chatId, chatId)),
          userId: UndefinedOr.map((userId) =>
            inArray(
              table.chatId,
              db.select({ id: chats.id }).from(chats).where(eq(chats.userId, userId)),
            ),
          ),
          status: UndefinedOr.map((statuses) => inArray(table.status, Arr.copy(statuses))),
        })

      const select = (where: MessageEntityWhere) =>
        ({
          where: { RAW: (table: typeof messages) => skipUndefined(encodeWhere(table)(where)) },
          orderBy: inCreationOrder,
          with: withAttachments,
        }) as const

      return this.of({
        insert: Effect.fn('MessageRepository.insert')(
          (message) =>
            db
              .insert(messages)
              .values(message)
              .onConflictDoNothing({ target: messages.chatId, where: activeMessage })
              .returning({ id: messages.id })
              .pipe(
                orDieUnless(Arr.isReadonlyArrayNonEmpty, `message ${message.id} was not inserted`),
              ),
          orDieWithSqlError,
        ),
        update: Effect.fn('MessageRepository.update')(
          (set, where) =>
            db
              .update(messages)
              .set(encodeSet(set))
              .where(encodeWhere(messages)(where))
              .returning({ id: messages.id })
              .pipe(orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no message was updated')),
          orDieWithSqlError,
        ),
        selectOne: Effect.fn('MessageRepository.selectOne')(
          (where) =>
            db.query.messages
              .findFirst(select(where))
              .pipe(Effect.flatMap(decodeOptionalRow(MessageEntity))),
          orDieWithSqlError,
        ),
        selectMany: Effect.fn('MessageRepository.selectMany')(
          (where) => db.query.messages.findMany(select(where)).pipe(Effect.flatMap(decodeMessages)),
          orDieWithSqlError,
        ),
      })
    }),
  )
}
