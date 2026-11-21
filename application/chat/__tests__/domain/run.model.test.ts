import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, DateTime, Effect, Option, Schema, Struct } from 'effect'

import { activeRunStatuses } from '@app-template/kernel/data'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatId } from '#chat/domain/chat.util'
import { Message, MessageFields } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'
import { RunNotRetryableError, RunStatusInvalidError } from '#chat/domain/run.error'
import {
  completeRun,
  ensureRunRetryable,
  ensureRunUnstarted,
  failRun,
  isActiveRun,
  isStartedRun,
  Run,
  startRun,
} from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { RunStatus } from '#chat/domain/run-fields.model'

const createdAt = DateTime.makeUnsafe('2026-11-09T00:00:00.000Z')
const later = DateTime.makeUnsafe('2026-11-09T00:00:01.000Z')

const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000002')

const userMessage = new Message({
  author: 'user',
  id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000003'),
  chatId,
  text: 'Hi',
  createdAt,
})

const queued = new Run({
  id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000001'),
  chatId,
  userMessageId: userMessage.id,
  status: 'queued',
  failure: Option.none(),
  assistantMessageId: Option.none(),
  createdAt,
  updatedAt: createdAt,
  userMessage,
  assistantMessage: Option.none(),
})

const reply = new Message({
  author: 'assistant',
  id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000004'),
  chatId,
  text: 'Hello',
  createdAt: later,
})

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
  { to: 'done', from: ['generating'], move: completeRun(reply) },
  { to: 'failed', from: activeRunStatuses, move: failRun(Cause.fail('529 overloaded')) },
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

    const failed = yield* failRun(Cause.die(refused))(runAt('generating'))

    const { cause } = Option.getOrThrow(failed.failure)
    assert.include(cause, 'Error: SQS is unavailable')
    assert.include(cause, 'Error: the broker is down')
  }),
)

describe('completeRun', () => {
  it.effect('keeps the reply it settled with', () =>
    Effect.gen(function* () {
      const done = yield* completeRun(reply)(runAt('generating'))

      assertSchemaEquals(Schema.Option(MessageFields), done.assistantMessage, Option.some(reply))
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
