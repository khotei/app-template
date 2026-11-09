import { Context, Effect, Layer, type Option } from 'effect'

import type {
  RunEntity,
  RunEntityInsert,
  RunEntitySet,
  RunEntityWhere,
} from '#kernel/data/chat/run.entity'

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
  static readonly layer = Layer.succeed(
    this,
    this.of({
      insert: () => Effect.die('todo'),
      update: () => Effect.die('todo'),
      selectOne: () => Effect.die('todo'),
    }),
  )
}
