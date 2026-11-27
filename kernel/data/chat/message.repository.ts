import { Array as Arr, Context, Effect, flow, Layer, Option } from 'effect'

import { DbQuery } from '@app-template/packages/db'

import {
  type MessageEntity,
  type MessageEntityWhere,
  MessageRow,
} from '#kernel/data/chat/message.entity'
import { type MessageColumns, messages } from '#kernel/data/chat/message.table'
import { RowOrder } from '#kernel/data/data-order'
import { Db } from '#kernel/data/db.client'

/** Every read is in creation order. */
const read = { orderBy: RowOrder.inCreationOrder, with: MessageRow.withRuns } as const

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
        DbQuery.orDie,
      ),
      selectOne: Effect.fn('MessageRepository.selectOne')(
        (where) => db.query.messages.findFirst({ where, ...read }),
        Effect.map(flow(Option.fromUndefinedOr, Option.map(MessageRow.buildEntity))),
        DbQuery.orDie,
      ),
      selectMany: Effect.fn('MessageRepository.selectMany')(
        (where) => db.query.messages.findMany({ where, ...read }),
        Effect.map(Arr.map(MessageRow.buildEntity)),
        DbQuery.orDie,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
