import type * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Context, Layer } from 'effect'

import { DbClient } from '@app-template/packages/db'

import { relations } from '#kernel/data/relations'

/** Needs the `PgClient` in the context: the processes provide `PgClientFromConfig`, tests `DbTest`. */
export class Db extends Context.Service<Db, PgDrizzle.EffectPgDatabase<typeof relations>>()(
  '@app-template/kernel/data/Db',
  { make: DbClient.create(relations) },
) {
  static readonly layer = Layer.effect(this, this.make)
}
