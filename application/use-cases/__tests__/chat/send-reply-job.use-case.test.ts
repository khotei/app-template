import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Deferred, Effect, Fiber, Layer, Option } from 'effect'

import { layerChatTest, queuedRun } from '@app-template/application/chat/testing'
import type { RunEntitySet } from '@app-template/kernel/data'
import { QueueError, QueueSender } from '@app-template/packages/queue'

import { sendReplyJob } from '#use-cases/chat/send-reply-job.use-case'

const unavailable = new QueueError({ cause: new Error('SQS is unavailable') })

describe('sendReplyJob', () => {
  it.effect("fails the Run with the text of SQS's refusal, and answers the failed Run", () => {
    const RefusingQueueTest = Layer.mock(QueueSender, { send: () => Effect.fail(unavailable) })
    const updates: Array<RunEntitySet> = []
    return Effect.gen(function* () {
      const sent = yield* sendReplyJob(queuedRun)

      assert.strictEqual(sent.status, 'failed')
      assert.include(Option.getOrThrow(sent.failure).cause, 'SQS is unavailable')
      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
    }).pipe(
      Effect.provide(
        layerChatTest({
          runs: {
            update: (set) =>
              Effect.sync(() => {
                updates.push(set)
              }),
          },
        }).pipe(Layer.provideMerge(RefusingQueueTest)),
      ),
    )
  })

  it.effect('interrupted while SQS refuses the job, still fails the Run', () => {
    const sending = Deferred.makeUnsafe<void>()
    const refusing = Deferred.makeUnsafe<void>()
    const HeldRefusingQueueTest = Layer.mock(QueueSender, {
      send: () =>
        Deferred.succeed(sending, undefined).pipe(
          Effect.andThen(Deferred.await(refusing)),
          Effect.andThen(Effect.fail(unavailable)),
        ),
    })
    const updates: Array<RunEntitySet> = []
    return Effect.gen(function* () {
      const running = yield* sendReplyJob(queuedRun).pipe(Effect.forkChild)
      yield* Deferred.await(sending)
      const interrupting = yield* Fiber.interrupt(running).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Deferred.succeed(refusing, undefined)
      yield* Fiber.join(interrupting)

      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
    }).pipe(
      Effect.provide(
        layerChatTest({
          runs: {
            update: (set) =>
              Effect.sync(() => {
                updates.push(set)
              }),
          },
        }).pipe(Layer.provideMerge(HeldRefusingQueueTest)),
      ),
    )
  })
})
