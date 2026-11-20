import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, Effect } from 'effect'

import type { RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { RunStatusInvalidError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import type { RunStatus } from '#chat/domain/run-fields.model'
import { MoveRunService } from '#chat/services/move-run.service'
import { assistantMessageAt, queuedRun } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

/** Each move, the status it leaves from and the status it writes. */
const moves: ReadonlyArray<{
  readonly name: string
  readonly from: RunStatus
  readonly to: RunStatus
  readonly move: (
    moves: MoveRunService['Service'],
    run: Run,
  ) => Effect.Effect<Run, RunStatusInvalidError>
}> = [
  { name: 'prepare', from: 'queued', to: 'preparing', move: (moves, run) => moves.prepare(run) },
  {
    name: 'generate',
    from: 'preparing',
    to: 'generating',
    move: (moves, run) => moves.generate(run),
  },
  {
    name: 'complete',
    from: 'generating',
    to: 'done',
    move: (moves, run) => moves.complete(run, assistantMessageAt(1, 'Sure.')),
  },
  {
    name: 'fail',
    from: 'queued',
    to: 'failed',
    move: (moves, run) => moves.fail(run, Cause.fail('SQS is unavailable')),
  },
]

/** The service over a `RunRepository` whose updates land in `updates`. */
function recordUpdates() {
  const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
  const layer = layerChatTest({
    runs: {
      update: (...update) =>
        Effect.sync(() => {
          updates.push(update)
        }),
    },
  })
  return { updates, layer }
}

describe('MoveRunService', () => {
  it.effect.each(moves)(
    '$name writes the $to Run under the status it was read in',
    ({ from, to, move }) => {
      const { updates, layer } = recordUpdates()
      return Effect.gen(function* () {
        const service = yield* MoveRunService
        const run = new Run({ ...queuedRun, status: from })

        const moved = yield* move(service, run)

        assert.strictEqual(moved.status, to)
        assert.deepStrictEqual(
          Arr.map(updates, ([set, where]) => [set.status, where]),
          [[to, { id: run.id, status: [from] }]],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('a move the model refuses fails RunStatusInvalidError and writes nothing', () => {
    const { updates, layer } = recordUpdates()
    return Effect.gen(function* () {
      const service = yield* MoveRunService

      const error = yield* service.generate(queuedRun).pipe(Effect.flip)

      assertSchemaEquals(
        RunStatusInvalidError,
        error,
        new RunStatusInvalidError({ id: queuedRun.id, from: 'queued', to: 'generating' }),
      )
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })
})
