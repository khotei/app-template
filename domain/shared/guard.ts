import { Effect, Option, type Predicate } from 'effect'
import type { LazyArg } from 'effect/Function'

/**
 * Fails `missing` for a record the caller may not see, so a foreign record reads as absent rather
 * than forbidden.
 */
export const ensureFound = <A, E>(
  found: Option.Option<A>,
  holds: Predicate.Predicate<A>,
  missing: LazyArg<E>,
): Effect.Effect<A, E> => Effect.fromOption(Option.filter(found, holds), missing)
