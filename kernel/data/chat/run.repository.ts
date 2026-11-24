import { Array as Arr, Context, Effect, Layer, Option, Struct } from 'effect'

import { buildFilter, encodeFilter, orDieWithSqlError } from '@app-template/packages/db'

import {
  type RunEntitySelectWhere,
  type RunEntitySet,
  type RunEntityWhere,
  runSetColumns,
} from '#kernel/data/chat/run.entity'
import { type RunColumns, runs } from '#kernel/data/chat/run.table'
import { Db } from '#kernel/data/db.client'

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
              .where(encodeFilter(runs, where))
              .returning({ id: runs.id }),
          Effect.filterOrFail(Arr.isReadonlyArrayNonEmpty),
          Effect.asVoid,
          orDieWithSqlError,
        ),
        selectOne: Effect.fn('RunRepository.selectOne')(
          (where) => db.query.runs.findFirst({ where: buildFilter(where) }),
          Effect.map(Option.fromUndefinedOr),
          orDieWithSqlError,
        ),
      }),
    ),
  )
}
