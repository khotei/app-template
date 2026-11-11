import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { AssistantFailedError, AssistantRefusedError } from '#chat/domain/assistant.error'
import { ReplyProvenance } from '#chat/domain/assistant.port'
import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { buildAssistantMessage, buildUserMessage, MessageFields } from '#chat/domain/message.model'
import { RunNotRetryableError, RunStatusInvalidError } from '#chat/domain/run.error'
import {
  buildRun,
  buildRunFailure,
  completeRun,
  ensureRunRetryable,
  failRun,
  generateRun,
  isActiveRun,
  isStartedRun,
  prepareRun,
  Run,
} from '#chat/domain/run.model'
import { ActiveRunStatus, RunFailure, RunStatus } from '#chat/domain/run-fields.model'

const createdAt = DateTime.makeUnsafe('2026-11-09T00:00:00.000Z')
const later = DateTime.makeUnsafe('2026-11-09T00:00:01.000Z')
const cause = 'Provider returned 529: overloaded'

const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000002')

const userMessage = buildUserMessage({
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
  provenance: new ReplyProvenance({ provider: 'anthropic', model: 'haiku', instructionsHash: 'h' }),
  assistantMessageId: Option.none(),
  createdAt,
  updatedAt: createdAt,
  userMessage,
  assistantMessage: Option.none(),
})

const reply = buildAssistantMessage({
  id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000004'),
  chatId,
  text: 'Hello',
  createdAt: later,
})

const runAt = (status: RunStatus) => new Run({ ...queued, status })

describe('buildRun', () => {
  it.effect('builds a queued Run with no failure, last moved when built', () =>
    Effect.sync(() => assertSchemaEquals(Run, buildRun(queued), queued)),
  )
})

it.effect.each([
  { status: 'queued', active: true, started: false },
  { status: 'preparing', active: true, started: true },
  { status: 'generating', active: true, started: true },
  { status: 'done', active: false, started: false },
  { status: 'failed', active: false, started: false },
] as const)('a $status Run is active: $active, started: $started', ({ status, active, started }) =>
  Effect.sync(() => {
    assert.strictEqual(isActiveRun(runAt(status)), active)
    assert.strictEqual(isStartedRun(runAt(status)), started)
  }),
)

/** Each move and the statuses it leaves from; it refuses every other one. */
const moves: ReadonlyArray<{
  readonly to: RunStatus
  readonly from: ReadonlyArray<RunStatus>
  readonly move: (run: Run) => Effect.Effect<Run, RunStatusInvalidError>
}> = [
  { to: 'preparing', from: ActiveRunStatus.literals, move: (run) => prepareRun(run, later) },
  { to: 'generating', from: ['preparing'], move: (run) => generateRun(run, later) },
  {
    to: 'done',
    from: ActiveRunStatus.literals,
    move: (run) => completeRun(run, { reply, at: later }),
  },
  {
    to: 'failed',
    from: ActiveRunStatus.literals,
    move: (run) => failRun(run, { reason: 'ReplyFailed', cause, at: later }),
  },
]

const cases = Arr.flatMap(moves, ({ to, from, move }) =>
  Arr.map(RunStatus.literals, (status) => ({ to, status, move, allowed: from.includes(status) })),
)

it.effect.each(Arr.filter(cases, (move) => move.allowed))(
  'a move from $status to $to moves the Run and when it last moved',
  ({ to, status, move }) =>
    Effect.gen(function* () {
      const moved = yield* move(runAt(status))

      assert.strictEqual(moved.status, to)
      assert.strictEqual(moved.updatedAt, later)
    }),
)

it.effect.each(Arr.filter(cases, (move) => !move.allowed))(
  'a move from $status to $to fails RunStatusInvalidError',
  ({ to, status, move }) =>
    Effect.gen(function* () {
      const error = yield* move(runAt(status)).pipe(Effect.flip)

      assertSchemaEquals(
        RunStatusInvalidError,
        error,
        new RunStatusInvalidError({ id: queued.id, from: status, to }),
      )
    }),
)

it.effect.each([
  { reason: 'ReplyFailed', sentence: 'The assistant could not reply. Please try again.' },
  { reason: 'ReplyRefused', sentence: 'The assistant declined to answer this message.' },
] as const)(
  'failRun for $reason keeps the reason, a sentence of its own and the cause',
  ({ reason, sentence }) =>
    Effect.gen(function* () {
      const failed = yield* failRun(runAt('generating'), { reason, cause, at: later })

      assertSchemaEquals(
        Schema.Option(RunFailure),
        failed.failure,
        Option.some({ reason, message: sentence, cause }),
      )
    }),
)

describe('completeRun', () => {
  it.effect('keeps the reply it settled with', () =>
    Effect.gen(function* () {
      const done = yield* completeRun(runAt('generating'), { reply, at: later })

      assertSchemaEquals(Schema.Option(MessageFields), done.assistantMessage, Option.some(reply))
    }),
  )
})

describe('buildRunFailure', () => {
  it.effect.each([
    { error: new AssistantRefusedError({ cause: 'stop_reason refusal' }), reason: 'ReplyRefused' },
    { error: new AssistantFailedError({ cause: '401 invalid x-api-key' }), reason: 'ReplyFailed' },
  ] as const)(
    "fails a Run the assistant ended with $error._tag as $reason with the error's cause",
    ({ error, reason }) =>
      Effect.sync(() =>
        assert.deepStrictEqual(buildRunFailure(error), { reason, cause: error.cause }),
      ),
  )
})

describe('ensureRunRetryable', () => {
  it.effect('takes a failed newest Run of the message', () =>
    ensureRunRetryable(Option.some(runAt('failed')), userMessage.id),
  )

  it.effect.each([
    { name: 'no Run', newest: Option.none() },
    { name: 'a done Run', newest: Option.some(runAt('done')) },
    { name: 'a queued Run', newest: Option.some(runAt('queued')) },
    {
      name: 'a failed Run of another message',
      newest: Option.some(new Run({ ...runAt('failed'), userMessageId: reply.id })),
    },
  ])('refuses $name with RunNotRetryableError', ({ newest }) =>
    Effect.gen(function* () {
      const error = yield* ensureRunRetryable(newest, userMessage.id).pipe(Effect.flip)

      assertSchemaEquals(
        RunNotRetryableError,
        error,
        new RunNotRetryableError({ userMessageId: userMessage.id }),
      )
    }),
  )
})
