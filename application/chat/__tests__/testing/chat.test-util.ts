import { Deferred, Effect } from 'effect'

/**
 * A pause for a call a test scripts: `hold` signals `reached`, then waits for `release`, so a test
 * acts while a flow waits on that call.
 */
export function holdCall() {
  const reached = Deferred.makeUnsafe<void>()
  const released = Deferred.makeUnsafe<void>()
  return {
    hold: Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(released))),
    reached: Deferred.await(reached),
    release: Deferred.succeed(released, undefined),
  }
}
