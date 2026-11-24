import { inArray } from 'drizzle-orm'
import { Array as Arr, Context, Effect, flow, Layer, Option, UndefinedOr } from 'effect'

import { encodeWhere, orDieWithSqlError } from '@app-template/packages/db'

import { chatIdsOf } from '#kernel/data/chat/chat.table'
import {
  buildMessageEntity,
  inCreationOrder,
  type MessageEntity,
  type MessageEntityWhere,
} from '#kernel/data/chat/message.entity'
import { type MessageColumns, messages } from '#kernel/data/chat/message.table'
import { newestFirst } from '#kernel/data/chat/run.entity'
import { Db } from '#kernel/data/db.client'

// Built on the table a query names, as a relational query aliases `messages`; `userId` is the
// owner of the row's chat, no column of `messages`, so it is a condition of its own.
const select = ({ userId, ...where }: MessageEntityWhere) =>
  ({
    where: {
      RAW: (table: typeof messages) =>
        encodeWhere(table)(
          where,
          UndefinedOr.map(userId, (userId) => inArray(table.chatId, chatIdsOf(userId))),
        ),
    },
    orderBy: inCreationOrder,
    with: { newestRun: { orderBy: newestFirst }, replyOf: true },
  }) as const

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /** A message is never changed. */
    readonly insert: (message: MessageColumns) => Effect.Effect<void>
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
          (where) => db.query.messages.findFirst(select(where)),
          Effect.map(flow(Option.fromUndefinedOr, Option.map(buildMessageEntity))),
          orDieWithSqlError,
        ),
        selectMany: Effect.fn('MessageRepository.selectMany')(
          (where) => db.query.messages.findMany(select(where)),
          Effect.map(Arr.map(buildMessageEntity)),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
