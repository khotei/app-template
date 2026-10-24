import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Effect, Layer } from 'effect'

import { PgClientTest } from '@app-template/testing'

import { Db, unwrapQueryError } from '#infrastructure/db/db.client'

/** Publishes `PgClient` too, as `Db.layerFromConfig` does, so a test can open transactions. */
export const DbTest = Db.layer.pipe(Layer.provideMerge(PgClientTest))

/** Succeeds with the `SqlError` a statement fails with, so a test reads its `reason`. */
export const flipSqlError = <A, R>(self: Effect.Effect<A, EffectDrizzleQueryError, R>) =>
  Effect.flip(self.pipe(Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError)))
