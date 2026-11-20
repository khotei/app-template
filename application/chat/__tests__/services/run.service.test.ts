import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option } from 'effect'

import type { RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'

import { Run } from '#chat/domain/run.model'
import { RunFields } from '#chat/domain/run-fields.model'
import { RunService } from '#chat/services/run.service'
import { queuedRun } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

describe('RunService', () => {
  it.effect('fail writes the failed Run under the status it was given in, and returns it', () => {
    const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
    return Effect.gen(function* () {
      const runs = yield* RunService
      const failure = { reason: 'QueueError', cause: 'SQS is unavailable' }

      const failed = yield* runs.fail(queuedRun, failure)

      const expected = new Run({ ...queuedRun, status: 'failed', failure: Option.some(failure) })
      assertEquals(failed, expected)
      assert.deepStrictEqual(updates, [
        [yield* encodeWith(RunFields)(expected), { id: queuedRun.id, status: ['queued'] }],
      ])
    }).pipe(
      Effect.provide(
        layerChatTest({
          runs: {
            update: (...update) =>
              Effect.sync(() => {
                updates.push(update)
              }),
          },
        }),
      ),
    )
  })
})
