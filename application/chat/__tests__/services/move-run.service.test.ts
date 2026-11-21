import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, Effect, Option } from 'effect'

import type { RunEntitySelectWhere, RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import {
  ActiveRunNotFoundError,
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
  ) => Effect.Effect<Run, ActiveRunNotFoundError | RunStartedError>
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
    from: 'queued',
    to: 'failed',
    move: (moves, run) => moves.fail(run, Cause.fail('SQS is unavailable')),
  },
  {
    name: 'failActive',
    from: 'generating',
    to: 'failed',
    move: (moves, run) => moves.failActive(run.userMessageId, Cause.fail('the assistant failed')),
  },
]

/**
 * The service over a `RunRepository` that reads `stored`, whose reads' `where` land in `reads`
 * and updates in `updates`.
 */
function recordUpdates(stored: Option.Option<Run> = Option.some(queuedRun)) {
  const reads: Array<RunEntitySelectWhere> = []
  const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
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
    const { layer } = recordUpdates()
    return Effect.gen(function* () {
      const service = yield* MoveRunService
      const refused = new Error('SQS is unavailable', { cause: new Error('the broker is down') })

      const failed = yield* service.fail(queuedRun, Cause.die(refused))

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

      assert.deepStrictEqual(
        [error._tag, error._tag === 'RunStartedError' && error.id],
        ['RunStartedError', queuedRun.id],
      )
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each([
    {
      name: 'start',
      move: (moves: MoveRunService['Service']) => moves.start(queuedRun.userMessageId),
    },
    {
      name: 'failActive',
      move: (moves: MoveRunService['Service']) =>
        moves.failActive(queuedRun.userMessageId, sqsUnavailable),
    },
  ])('$name reads the active Run of its user message', ({ move }) => {
    const { reads, layer } = recordUpdates()
    return Effect.gen(function* () {
      const service = yield* MoveRunService

      yield* move(service).pipe(Effect.ignore)

      assert.deepStrictEqual(reads, [
        { userMessageId: queuedRun.userMessageId, status: ['queued', 'generating'] },
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each([
    {
      name: 'start',
      move: (moves: MoveRunService['Service']) => moves.start(queuedRun.userMessageId),
    },
    {
      name: 'failActive',
      move: (moves: MoveRunService['Service']) =>
        moves.failActive(queuedRun.userMessageId, sqsUnavailable),
    },
  ])(
    '$name of a message with no active Run fails ActiveRunNotFoundError and writes nothing',
    ({ move }) => {
      const { updates, layer } = recordUpdates(Option.none())
      return Effect.gen(function* () {
        const service = yield* MoveRunService

        const error = yield* move(service).pipe(Effect.flip)

        assertSchemaEquals(
          ActiveRunNotFoundError,
          error,
          new ActiveRunNotFoundError({ userMessageId: queuedRun.userMessageId }),
        )
        assert.deepStrictEqual(updates, [])
      }).pipe(Effect.provide(layer))
    },
  )
})
