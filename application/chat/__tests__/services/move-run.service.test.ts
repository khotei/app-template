import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, Effect, Option } from 'effect'

import type { RunEntitySet, RunEntityUpdateWhere, RunEntityWhere } from '@app-template/kernel/data'
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
  {
    name: 'start',
    from: 'queued',
    to: 'generating',
    move: (moves, run) => moves.start(run.userMessageId),
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
    move: (moves, run) => moves.fail({ id: run.id }, Cause.fail('SQS is unavailable')),
  },
]

/**
 * The service over a `RunRepository` that reads `stored`, whose reads' `where` land in `reads`
 * and updates in `updates`.
 */
function recordUpdates(stored: Option.Option<Run> = Option.some(queuedRun)) {
  const reads: Array<RunEntityWhere> = []
  const updates: Array<readonly [RunEntitySet, RunEntityUpdateWhere]> = []
  const read = stored.pipe(Option.map(encodeWith(Run)), Effect.transposeOption)
  const layer = layerChatTest({
    runs: {
      selectOne: (where) =>
        Effect.sync(() => {
          reads.push(where)
        }).pipe(Effect.andThen(read)),
      update: (...update) =>
        Effect.sync(() => {
          updates.push(update)
        }),
    },
  })
  return { reads, updates, layer }
}

const sqsUnavailable = Cause.fail('SQS is unavailable')

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

      const defect = yield* service
        .complete(queuedRun, assistantMessageAt(1, 'Sure.'))
        .pipe(Effect.catchDefect(Effect.succeed))

      assertSchemaEquals(
        RunStatusInvalidError,
        defect,
        new RunStatusInvalidError({ id: queuedRun.id, from: 'queued', to: 'done' }),
      )
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect('fail keeps the full text of the cause, its nested causes included', () => {
    const { layer } = recordUpdates(Option.some(new Run({ ...queuedRun, status: 'generating' })))
    return Effect.gen(function* () {
      const service = yield* MoveRunService
      const refused = new Error('SQS is unavailable', { cause: new Error('the broker is down') })

      const failed = yield* service.fail({ id: queuedRun.id }, Cause.die(refused))

      const { cause } = Option.getOrThrow(failed.failure)
      assert.include(cause, 'Error: SQS is unavailable')
      assert.include(cause, 'Error: the broker is down')
    }).pipe(Effect.provide(layer))
  })

  it.effect('start of a Run some worker started fails RunStartedError and writes nothing', () => {
    const { updates, layer } = recordUpdates(
      Option.some(new Run({ ...queuedRun, status: 'generating' })),
    )
    return Effect.gen(function* () {
      const service = yield* MoveRunService

      const error = yield* service.start(queuedRun.userMessageId).pipe(Effect.flip)

      assert.deepStrictEqual([error._tag, error.id], ['RunStartedError', queuedRun.id])
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each([
    {
      name: 'start',
      move: (moves: MoveRunService['Service']) => moves.start(queuedRun.userMessageId),
      where: { userMessageId: queuedRun.userMessageId },
    },
    {
      name: 'fail by the user message',
      move: (moves: MoveRunService['Service']) =>
        moves.fail({ userMessageId: queuedRun.userMessageId }, sqsUnavailable),
      where: { userMessageId: queuedRun.userMessageId },
    },
    {
      name: 'fail by the id',
      move: (moves: MoveRunService['Service']) => moves.fail({ id: queuedRun.id }, sqsUnavailable),
      where: { id: queuedRun.id },
    },
  ])('$name reads the active Run its where names', ({ move, where }) => {
    const { reads, layer } = recordUpdates()
    return Effect.gen(function* () {
      const service = yield* MoveRunService

      yield* move(service).pipe(Effect.ignore)

      assert.deepStrictEqual(reads, [{ ...where, status: ['queued', 'generating'] }])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each([
    {
      name: 'start',
      move: (moves: MoveRunService['Service']) => moves.start(queuedRun.userMessageId),
      error: new RunNotFoundError({ userMessageId: queuedRun.userMessageId }),
    },
    {
      name: 'fail by the user message',
      move: (moves: MoveRunService['Service']) =>
        moves.fail({ userMessageId: queuedRun.userMessageId }, sqsUnavailable),
      error: new RunNotFoundError({ userMessageId: queuedRun.userMessageId }),
    },
    {
      name: 'fail by the id',
      move: (moves: MoveRunService['Service']) => moves.fail({ id: queuedRun.id }, sqsUnavailable),
      error: new RunNotFoundError({ id: queuedRun.id }),
    },
  ])(
    '$name of a Run settled or gone fails RunNotFoundError and writes nothing',
    ({ move, error: expected }) => {
      const { updates, layer } = recordUpdates(Option.none())
      return Effect.gen(function* () {
        const service = yield* MoveRunService

        const error = yield* move(service).pipe(Effect.flip)

        assertSchemaEquals(RunNotFoundError, error, expected)
        assert.deepStrictEqual(updates, [])
      }).pipe(Effect.provide(layer))
    },
  )
})
