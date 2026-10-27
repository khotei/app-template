import { BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import { ApiLayer } from '#api/layer'

declare global {
  /**
   * Stops the api runtime of the previous `bun --hot` evaluation and resolves once its finalizers
   * have run.
   *
   * A reload re-evaluates every module, `effect` included, in the same process and leaves the old
   * runtime running, so the handle is a plain `Promise` on `globalThis`, the one thing a reload
   * keeps. It ends the old launch with a success: interrupting the old fiber instead would make
   * `runMain` exit the process with code 130.
   */
  var stopPreviousApi: (() => Promise<void>) | undefined
}

await globalThis.stopPreviousApi?.()

const reloaded = Promise.withResolvers<void>()
const stopped = Promise.withResolvers<void>()
globalThis.stopPreviousApi = () => {
  reloaded.resolve()
  return stopped.promise
}

BunRuntime.runMain(
  Layer.launch(ApiLayer).pipe(
    Effect.raceFirst(Effect.promise(() => reloaded.promise)),
    Effect.ensuring(Effect.sync(() => stopped.resolve())),
  ),
)
