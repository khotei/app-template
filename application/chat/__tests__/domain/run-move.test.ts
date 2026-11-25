import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, Effect, Option, Struct } from 'effect'

import { MessageId } from '#chat/domain/message.util'
import {
  activeRunStatuses,
  Run,
  type RunFields,
  RunStatus,
  RunStatusInvalidError,
} from '#chat/domain/run.model'
import { RunMove } from '#chat/domain/run-move'
import { queuedRun } from '#testing/chat/chat.test-fixture'

const replyId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000004')

const runAt = (status: RunStatus) => new Run({ ...queuedRun, status })

/** Each move and the statuses it leaves from; it refuses every other one. */
const moves: ReadonlyArray<{
  readonly to: RunStatus
  readonly from: ReadonlyArray<RunStatus>
  readonly move: (run: RunFields) => Effect.Effect<Run>
}> = [
  // The move passed as a value, as a caller's combinator takes it.
  { to: 'generating', from: ['queued'], move: RunMove.start },
  { to: 'done', from: ['generating'], move: (run) => RunMove.complete(run, replyId) },
  {
    to: 'failed',
    from: activeRunStatuses,
    move: (run) => RunMove.fail(run, Cause.fail('529 overloaded')),
  },
]

const cases = Arr.flatMap(moves, ({ to, from, move }) =>
  Arr.map(RunStatus.literals, (status) => ({ to, status, move, allowed: from.includes(status) })),
)

it.effect.each(Arr.filter(cases, (move) => move.allowed))(
  'a move from $status to $to moves the Run',
  ({ to, status, move }) =>
    Effect.gen(function* () {
      const moved = yield* move(runAt(status))

      assert.strictEqual(moved.status, to)
    }),
)

it.effect.each(Arr.filter(cases, (move) => !move.allowed))(
  'a move from $status to $to dies with RunStatusInvalidError',
  ({ to, status, move }) =>
    Effect.gen(function* () {
      const defect = yield* move(runAt(status)).pipe(Effect.catchDefect(Effect.succeed))

      assert.instanceOf(defect, RunStatusInvalidError)
      assert.deepStrictEqual(Struct.pick(defect, ['id', 'from', 'to']), {
        id: queuedRun.id,
        from: status,
        to,
      })
    }),
)

describe('RunMove.fail', () => {
  it.effect('keeps the full text of the cause, its nested causes included', () =>
    Effect.gen(function* () {
      const refused = new Error('SQS is unavailable', { cause: new Error('the broker is down') })

      const failed = yield* RunMove.fail(runAt('generating'), Cause.die(refused))

      const { cause } = Option.getOrThrow(failed.failure)
      assert.include(cause, 'Error: SQS is unavailable')
      assert.include(cause, 'Error: the broker is down')
    }),
  )
})

describe('RunMove.complete', () => {
  it.effect('names the reply it settled with', () =>
    Effect.gen(function* () {
      const done = yield* RunMove.complete(runAt('generating'), replyId)

      assert.deepStrictEqual(done.assistantMessageId, Option.some(replyId))
    }),
  )
})

it.effect('a move takes a spread Run and returns a Run', () =>
  Effect.gen(function* () {
    const started = yield* RunMove.start({ ...queuedRun })
    const done = yield* RunMove.complete({ ...started }, replyId)

    assert.instanceOf(started, Run)
    assert.deepStrictEqual([started.status, done.status], ['generating', 'done'])
  }),
)
