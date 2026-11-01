import type * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Context, Layer } from 'effect'

import { createDb } from '@app-template/db'
import { PgClientFromConfig } from '@app-template/kernel/postgres'

import { relations } from '#infrastructure/db/relations'

export class Db extends Context.Service<Db, PgDrizzle.EffectPgDatabase<typeof relations>>()(
  '@app-template/infrastructure/db/Db',
  { make: createDb(relations) },
) {
  static readonly layer = Layer.effect(this, this.make)

  /** Publishes the `PgClient` too, so callers open transactions on the connection `Db` uses. */
  static readonly layerFromConfig = this.layer.pipe(Layer.provideMerge(PgClientFromConfig))
}
