import { Context, Effect, Layer, RcMap, Semaphore } from 'effect'

import type { UserId } from '@app-template/domain/user'

/**
 * Runs a user's check-then-write flows one at a time, so two sends cannot both find no active
 * message, nor bind one attachment in two chats.
 *
 * Per user, not per chat: a chat lock leaves the cross-chat bind open. It spans one layer build
 * of one process: every holder must come from the same build, and a second api process needs the
 * store's guards (one active message per chat, a bind only while unbound). It is not reentrant.
 */
export class UserLock extends Context.Service<
  UserLock,
  {
    /** Runs `effect` while holding the user's permit; pass it to `Effect.fn` as a pipeable. */
    readonly withPermit: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      userId: UserId,
    ) => Effect.Effect<A, E, R>
  }
>()('@app-template/application/user/UserLock', {
  make: Effect.gen(function* () {
    const locks = yield* RcMap.make({ lookup: (_: UserId) => Semaphore.make(1) })
    return {
      withPermit: <A, E, R>(effect: Effect.Effect<A, E, R>, userId: UserId) =>
        RcMap.get(locks, userId).pipe(
          Effect.flatMap((lock) => lock.withPermit(effect)),
          Effect.scoped,
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
