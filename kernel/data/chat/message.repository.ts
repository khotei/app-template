import { Array as Arr, Context, Effect, flow, Layer, Option } from 'effect'

import { orDieWithSqlError } from '@app-template/packages/db'

import {
  buildMessageEntity,
  inCreationOrder,
  type MessageEntity,
  type MessageEntityWhere,
} from '#kernel/data/chat/message.entity'
import { type MessageColumns, messages } from '#kernel/data/chat/message.table'
import { newestFirst } from '#kernel/data/chat/run.entity'
import { Db } from '#kernel/data/db.client'

/** Every read is in creation order and nests the Runs `buildMessageEntity` picks from. */
const read = {
  orderBy: inCreationOrder,
  with: { newestRun: { orderBy: newestFirst }, replyOf: true },
} as const

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
>()('@app-template/kernel/data/chat/MessageRepository', {
  make: Effect.gen(function* () {
    const db = yield* Db
    return {
      insert: Effect.fn('MessageRepository.insert')(
        (message) => db.insert(messages).values(message),
        orDieWithSqlError,
      ),
      selectOne: Effect.fn('MessageRepository.selectOne')(
        (where) => db.query.messages.findFirst({ where, ...read }),
        Effect.map(flow(Option.fromUndefinedOr, Option.map(buildMessageEntity))),
        orDieWithSqlError,
      ),
      selectMany: Effect.fn('MessageRepository.selectMany')(
        (where) => db.query.messages.findMany({ where, ...read }),
        Effect.map(Arr.map(buildMessageEntity)),
        orDieWithSqlError,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
