import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Fiber, Layer, Option } from 'effect'

import type { RunEntitySet } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'

import { Run } from '#chat/domain/run.model'
import { JobRunService } from '#chat/services/job-run.service'
import { queuedRun } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'
import { holdAssistantCall } from '#testing/chat/message-assistant.test-fake'
import { layerRefusingQueueTest } from '#testing/chat/queue-sender.test-fake'

/** The services over `queue` and a store that reads `queuedRun`, whose updates land in `updates`. */
function recordUpdates<Queue>(queue: Layer.Layer<Queue>) {
  const updates: Array<RunEntitySet> = []
  const layer = layerChatTest({
    runs: {
      selectOne: () => encodeWith(Run)(queuedRun).pipe(Effect.map(Option.some)),
      update: (set) =>
        Effect.sync(() => {
          updates.push(set)
        }),
    },
  }).pipe(Layer.provideMerge(queue))
  return { updates, layer }
}

describe('JobRunService', () => {
  it.effect("send fails the Run with the text of SQS's refusal, and answers the failed Run", () => {
    const { updates, layer } = recordUpdates(layerRefusingQueueTest())
    return Effect.gen(function* () {
      const jobs = yield* JobRunService

      const sent = yield* jobs.send(queuedRun)

      assert.strictEqual(sent.status, 'failed')
      assert.include(Option.getOrThrow(sent.failure).cause, 'SQS is unavailable')
      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect('send interrupted while SQS refuses the job still fails the Run', () => {
    const held = holdAssistantCall()
    const { updates, layer } = recordUpdates(layerRefusingQueueTest(held.hold))
    return Effect.gen(function* () {
      const jobs = yield* JobRunService

      const running = yield* jobs.send(queuedRun).pipe(Effect.forkChild)
      yield* held.asked
      const interrupting = yield* Fiber.interrupt(running).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      yield* held.release
      yield* Fiber.join(interrupting)

      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
    }).pipe(Effect.provide(layer))
  })
})
