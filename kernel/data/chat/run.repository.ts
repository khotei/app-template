import { eq, inArray } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  type Option,
  Struct,
  type Types,
  UndefinedOr,
} from 'effect'

import { buildWhere, orDieWithSqlError } from '@app-template/packages/db'

import { chats } from '#kernel/data/chat/chat.table'
import {
  type RunEntitySelectWhere,
  type RunEntitySet,
  type RunEntityWhere,
  runSetColumns,
} from '#kernel/data/chat/run.entity'
import { type RunColumns, runs } from '#kernel/data/chat/run.table'
import { Db } from '#kernel/data/db.client'

// `userId` is the owner of the Run's chat, so a Run of another user's chat reads as absent.
const encodeWhere = buildWhere<
  Types.Simplify<Partial<RunEntityWhere & Pick<RunColumns, 'userMessageId'>>>
>({
  id: UndefinedOr.map((id) => eq(runs.id, id)),
  chatId: UndefinedOr.map((chatId) => eq(runs.chatId, chatId)),
  userMessageId: UndefinedOr.map((userMessageId) => eq(runs.userMessageId, userMessageId)),
  userId: UndefinedOr.map((userId) =>
    inArray(
      runs.chatId,
      new QueryBuilder().select({ id: chats.id }).from(chats).where(eq(chats.userId, userId)),
    ),
  ),
  status: UndefinedOr.map((statuses) => inArray(runs.status, Arr.copy(statuses))),
})

export class RunRepository extends Context.Service<
  RunRepository,
  {
    /** Dies when the Run is active and its chat already has one. */
    readonly insert: (run: RunColumns) => Effect.Effect<void>
    /** Writes the fields of `set` a Run may change where `where` holds; dies when it writes nothing. */
    readonly update: (set: RunEntitySet, where: RunEntityWhere) => Effect.Effect<void>
    /** Returns the Run where `where` holds, its row alone. */
    readonly selectOne: (where: RunEntitySelectWhere) => Effect.Effect<Option.Option<RunColumns>>
  }
>()('@app-template/kernel/data/chat/RunRepository') {
  static readonly layer = Layer.effect(
    this,
    Db.useSync((db) =>
      this.of({
        insert: Effect.fn('RunRepository.insert')(
          (run) => db.insert(runs).values(run),
          orDieWithSqlError,
        ),
        update: Effect.fn('RunRepository.update')(
          (set, where) =>
            db
              .update(runs)
              .set(Struct.pick(set, runSetColumns))
              .where(encodeWhere(where))
              .returning({ id: runs.id }),
          Effect.filterOrFail(Arr.isReadonlyArrayNonEmpty),
          Effect.asVoid,
          orDieWithSqlError,
        ),
        selectOne: Effect.fn('RunRepository.selectOne')(
          (where) => db.select().from(runs).where(encodeWhere(where)).limit(1),
          Effect.map(Arr.head),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
