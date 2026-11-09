import { eq, inArray } from 'drizzle-orm'
import { Array as Arr, Context, Effect, identity, Layer, type Option, UndefinedOr } from 'effect'

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
  RunEntity,
  type RunEntityInsert,
  type RunEntitySet,
  type RunEntityWhere,
} from '#kernel/data/chat/run.entity'
import { activeRun, runs } from '#kernel/data/chat/run.table'
import { Db } from '#kernel/data/db.client'

const encodeSet = buildSet<RunEntitySet, typeof runs>({
  status: identity,
  failure: identity,
  updatedAt: identity,
})

export class RunRepository extends Context.Service<
  RunRepository,
  {
    /** Dies when it writes nothing: the Run is active and its chat already has one. */
    readonly insert: (run: typeof RunEntityInsert.Type) => Effect.Effect<void>
    /** Writes the fields of `set` a Run may change where `where` holds; dies when it writes nothing. */
    readonly update: (set: RunEntitySet, where: RunEntityWhere) => Effect.Effect<void>
    /** Returns the Run where `where` holds, the newest when several do. */
    readonly selectOne: (where: RunEntityWhere) => Effect.Effect<Option.Option<RunEntity>>
  }
>()('@app-template/kernel/data/chat/RunRepository') {
  static readonly layer = Layer.effect(
    this,
    Db.useSync((db) => {
      // Built on the table a query names, as a relational query aliases `runs`; `userId` is the
      // owner of the Run's chat, so a Run of another user's chat reads as absent.
      const encodeWhere = (table: typeof runs) =>
        buildWhere<RunEntityWhere>({
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

      return this.of({
        insert: Effect.fn('RunRepository.insert')(
          (run) =>
            db
              .insert(runs)
              .values(run)
              .onConflictDoNothing({ target: runs.chatId, where: activeRun })
              .returning({ id: runs.id })
              .pipe(orDieUnless(Arr.isReadonlyArrayNonEmpty, `run ${run.id} was not inserted`)),
          orDieWithSqlError,
        ),
        update: Effect.fn('RunRepository.update')(
          (set, where) =>
            db
              .update(runs)
              .set(encodeSet(set))
              .where(encodeWhere(runs)(where))
              .returning({ id: runs.id })
              .pipe(orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no run was updated')),
          orDieWithSqlError,
        ),
        selectOne: Effect.fn('RunRepository.selectOne')(
          (where) =>
            db.query.runs
              .findFirst({
                where: { RAW: (table) => skipUndefined(encodeWhere(table)(where)) },
                orderBy: { createdAt: 'desc', id: 'desc' },
              })
              .pipe(Effect.flatMap(decodeOptionalRow(RunEntity))),
          orDieWithSqlError,
        ),
      })
    }),
  )
}
