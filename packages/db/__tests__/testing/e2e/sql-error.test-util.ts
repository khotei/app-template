import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Effect } from 'effect'

import { unwrapQueryError } from '#db/db.client'

/** Succeeds with the `SqlError` a statement fails with, so a test reads its `reason`. */
export const flipSqlError = <A, R>(self: Effect.Effect<A, EffectDrizzleQueryError, R>) =>
  self.pipe(Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError), Effect.flip)
