import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, DateTime, Effect, Option, Struct } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { RunNotRetryableError, RunStatusInvalidError } from '#chat/domain/run.error'
import {
  activeRunStatuses,
  completeRun,
  ensureRunRetryable,
  ensureRunUnstarted,
  failRun,
  isActiveRun,
  isStartedRun,
  Run,
  RunStatus,
  startRun,
} from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'

const createdAt = DateTime.makeUnsafe('2026-11-09T00:00:00.000Z')

const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000002')

const queued = new Run({
  id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000001'),
  chatId,
  userMessageId: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000003'),
  status: 'queued',
  failure: Option.none(),
  assistantMessageId: Option.none(),
  createdAt,
  updatedAt: createdAt,
})

const replyId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000004')

const runAt = (status: RunStatus) => new Run({ ...queued, status })

it.each([
  { status: 'queued', active: true, started: false },
  { status: 'generating', active: true, started: true },
  { status: 'done', active: false, started: false },
  { status: 'failed', active: false, started: false },
] as const)(
  'a $status Run is active: $active, started: $started',
  ({ status, active, started }) => {
    assert.strictEqual(isActiveRun(runAt(status)), active)
    assert.strictEqual(isStartedRun(runAt(status)), started)
  },
)

/** Each move and the statuses it leaves from; it refuses every other one. */
const moves: ReadonlyArray<{
  readonly to: RunStatus
  readonly from: ReadonlyArray<RunStatus>
  readonly move: (run: Run) => Effect.Effect<Run>
}> = [
  { to: 'generating', from: ['queued'], move: startRun },
  { to: 'done', from: ['generating'], move: (run) => completeRun(run, replyId) },
  {
    to: 'failed',
    from: activeRunStatuses,
    move: (run) => failRun(run, Cause.fail('529 overloaded')),
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
        id: queued.id,
        from: status,
        to,
      })
    }),
)

it.effect('failRun keeps the full text of the cause, its nested causes included', () =>
  Effect.gen(function* () {
    const refused = new Error('SQS is unavailable', { cause: new Error('the broker is down') })

    const failed = yield* failRun(runAt('generating'), Cause.die(refused))

    const { cause } = Option.getOrThrow(failed.failure)
    assert.include(cause, 'Error: SQS is unavailable')
    assert.include(cause, 'Error: the broker is down')
  }),
)

describe('completeRun', () => {
  it.effect('keeps the reply it settled with', () =>
    Effect.gen(function* () {
      const done = yield* completeRun(runAt('generating'), replyId)

      assert.deepStrictEqual(done.assistantMessageId, Option.some(replyId))
    }),
  )
})

describe('ensureRunUnstarted', () => {
  it.effect('returns a queued Run', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* ensureRunUnstarted(queued), queued)
    }),
  )

  it.effect('refuses a generating Run with RunStartedError, naming the Run', () =>
    Effect.gen(function* () {
      const error = yield* ensureRunUnstarted(runAt('generating')).pipe(Effect.flip)

      assert.strictEqual(error.id, queued.id)
    }),
  )
})

describe('ensureRunRetryable', () => {
  it.effect('returns a failed newest Run', () =>
    Effect.gen(function* () {
      const newest = runAt('failed')

      assert.strictEqual(yield* ensureRunRetryable(Option.some(newest)), newest)
    }),
  )

  it.effect.each([
    { name: 'no Run', newest: Option.none() },
    { name: 'a done Run', newest: Option.some(runAt('done')) },
    { name: 'a queued Run', newest: Option.some(runAt('queued')) },
  ])('refuses $name with RunNotRetryableError', ({ newest }) =>
    Effect.gen(function* () {
      const error = yield* ensureRunRetryable(newest).pipe(Effect.flip)

      assertSchemaEquals(RunNotRetryableError, error, new RunNotRetryableError())
    }),
  )
})
