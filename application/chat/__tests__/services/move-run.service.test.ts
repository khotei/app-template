import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, Effect, Option } from 'effect'

import type { RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import {
  RunNotFoundError,
  type RunStartedError,
  RunStatusInvalidError,
} from '#chat/domain/run.error'
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
  ) => Effect.Effect<Run, RunNotFoundError | RunStartedError>
}> = [
  { name: 'prepare', from: 'queued', to: 'preparing', move: (moves, run) => moves.prepare(run.id) },
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
    from: 'generating',
    to: 'failed',
    move: (moves, run) => moves.fail(run.id, Cause.fail('SQS is unavailable')),
  },
]

/** The service over a `RunRepository` that reads `stored`, whose updates land in `updates`. */
function recordUpdates(stored: Option.Option<Run> = Option.some(queuedRun)) {
  const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
  const layer = layerChatTest({
    runs: {
      selectOne: () => stored.pipe(Option.map(encodeWith(Run)), Effect.transposeOption),
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
      const run = new Run({ ...queuedRun, status: from })
      const { updates, layer } = recordUpdates(Option.some(run))
      return Effect.gen(function* () {
        const service = yield* MoveRunService

        const moved = yield* move(service, run)

        assert.strictEqual(moved.status, to)
        assert.deepStrictEqual(
          Arr.map(updates, ([set, where]) => [set.status, where]),
          [[to, { id: run.id, status: [from] }]],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('a move the model refuses dies with RunStatusInvalidError and writes nothing', () => {
    const { updates, layer } = recordUpdates()
    return Effect.gen(function* () {
      const service = yield* MoveRunService

      const defect = yield* service.generate(queuedRun).pipe(Effect.catchDefect(Effect.succeed))

      assertSchemaEquals(
        RunStatusInvalidError,
        defect,
        new RunStatusInvalidError({ id: queuedRun.id, from: 'queued', to: 'generating' }),
      )
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect('fail keeps the full text of the cause, its nested causes included', () => {
    const { layer } = recordUpdates(Option.some(new Run({ ...queuedRun, status: 'generating' })))
    return Effect.gen(function* () {
      const service = yield* MoveRunService
      const refused = new Error('SQS is unavailable', { cause: new Error('the broker is down') })

      const failed = yield* service.fail(queuedRun.id, Cause.die(refused))

      const { cause } = Option.getOrThrow(failed.failure)
      assert.include(cause, 'Error: SQS is unavailable')
      assert.include(cause, 'Error: the broker is down')
    }).pipe(Effect.provide(layer))
  })

  it.effect('prepare of a Run some worker started fails RunStartedError and writes nothing', () => {
    const { updates, layer } = recordUpdates(
      Option.some(new Run({ ...queuedRun, status: 'preparing' })),
    )
    return Effect.gen(function* () {
      const service = yield* MoveRunService

      const error = yield* service.prepare(queuedRun.id).pipe(Effect.flip)

      assert.deepStrictEqual([error._tag, error.id], ['RunStartedError', queuedRun.id])
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each([
    { name: 'prepare', move: (moves: MoveRunService['Service']) => moves.prepare(queuedRun.id) },
    {
      name: 'fail',
      move: (moves: MoveRunService['Service']) =>
        moves.fail(queuedRun.id, Cause.fail('SQS is unavailable')),
    },
  ])('$name of a Run settled or gone fails RunNotFoundError and writes nothing', ({ move }) => {
    const { updates, layer } = recordUpdates(Option.none())
    return Effect.gen(function* () {
      const service = yield* MoveRunService

      const error = yield* move(service).pipe(Effect.flip)

      assertSchemaEquals(RunNotFoundError, error, new RunNotFoundError({ id: queuedRun.id }))
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })
})
