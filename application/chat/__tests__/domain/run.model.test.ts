import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, DateTime, Effect, Equal, Option, Schema, Struct } from 'effect'

import { UserId } from '@app-template/application/identity'
import { activeRunStatuses } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import {
  RunNotRetryableError,
  RunStartedError,
  RunStatusInvalidError,
} from '#chat/domain/run.error'
import {
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
  userId: UserId.make('0192d4e0-7b3a-7c00-8000-000000000005'),
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
  it.effect('names the reply it settled with', () =>
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

      assert.instanceOf(error, RunStartedError)
      assert.deepStrictEqual(Struct.pick(error, ['id']), { id: queued.id })
    }),
  )
})

describe('Run', () => {
  it.effect('starts, completes with its reply and fails with the text of its cause', () =>
    Effect.gen(function* () {
      const started = yield* queued.start()
      const done = yield* started.complete(replyId)
      const failed = yield* started.fail(Cause.fail('529 overloaded'))

      assert.deepStrictEqual(
        [started.status, done.status, done.assistantMessageId, failed.status],
        ['generating', 'done', Option.some(replyId), 'failed'],
      )
      assert.include(Option.getOrThrow(failed.failure).cause, '529 overloaded')
    }),
  )

  it.effect('takes itself while unstarted, and refuses once started with RunStartedError', () =>
    Effect.gen(function* () {
      const error = yield* runAt('generating').ensureUnstarted().pipe(Effect.flip)

      assert.strictEqual(yield* queued.ensureUnstarted(), queued)
      assert.instanceOf(error, RunStartedError)
      assert.deepStrictEqual(Struct.pick(error, ['id']), { id: queued.id })
    }),
  )

  it.effect('decodes the row it reads into a Run, and dies on a row that does not decode', () =>
    Effect.gen(function* () {
      const row = yield* encodeWith(Run)(queued)

      const one = yield* Run.decodeOne(Option.some(row))
      const defect = yield* Run.decodeOne(Option.some({ ...row, id: 'not-a-uuid' })).pipe(
        Effect.catchDefect(Effect.succeed),
      )

      assert.instanceOf(Option.getOrThrow(one), Run)
      assert.isTrue(Equal.equals(Option.getOrThrow(one), queued))
      assert.isTrue(Schema.isSchemaError(defect))
    }),
  )

  it.effect('makes the update row of a Run as it holds it, its updatedAt moved to now', () =>
    Effect.gen(function* () {
      const { set, row } = yield* Run.makeUpdate(runAt('done'))

      assert.deepStrictEqual(
        [set.status, DateTime.toEpochMillis(set.updatedAt), row.updatedAt.getTime()],
        ['done', 0, 0],
      )
    }),
  )

  it('compares by its fields alone, its members adding none', () => {
    assert.isTrue(Equal.equals(runAt('done'), runAt('done')))
    assert.sameMembers(Object.keys(queued), Object.keys(Run.fields))
  })
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
