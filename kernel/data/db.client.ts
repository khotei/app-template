import type * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Context, Layer } from 'effect'

import { createDb } from '@app-template/db'

import { relations } from '#kernel/data/relations'

/** Needs the `PgClient` in the context: the processes provide `PgClientFromConfig`, tests `DbTest`. */
export class Db extends Context.Service<Db, PgDrizzle.EffectPgDatabase<typeof relations>>()(
  '@app-template/kernel/data/Db',
  { make: createDb(relations) },
) {
  static readonly layer = Layer.effect(this, this.make)
}
