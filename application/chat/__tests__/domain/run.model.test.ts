import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { AssistantFailedError, AssistantRefusedError } from '#chat/domain/assistant.error'
import { ReplyProvenance } from '#chat/domain/assistant.port'
import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { buildAssistantMessage, buildUserMessage, Message } from '#chat/domain/message.model'
import { RunStatusInvalidError } from '#chat/domain/run.error'
import {
  buildRun,
  buildRunFailure,
  completeRun,
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

describe.each([
  { status: 'queued', active: true, started: false },
  { status: 'preparing', active: true, started: true },
  { status: 'generating', active: true, started: true },
  { status: 'done', active: false, started: false },
  { status: 'failed', active: false, started: false },
] as const)('a $status Run', ({ status, active, started }) => {
  it.effect(`is active: ${active}, started: ${started}`, () =>
    Effect.sync(() => {
      assert.strictEqual(isActiveRun(runAt(status)), active)
      assert.strictEqual(isStartedRun(runAt(status)), started)
    }),
  )
})

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

describe.each(Arr.filter(cases, (move) => move.allowed))(
  'a move from $status to $to',
  ({ to, status, move }) => {
    it.effect('moves the Run and when it last moved', () =>
      Effect.gen(function* () {
        const moved = yield* move(runAt(status))

        assert.strictEqual(moved.status, to)
        assert.strictEqual(moved.updatedAt, later)
      }),
    )
  },
)

describe.each(Arr.filter(cases, (move) => !move.allowed))(
  'a move from $status to $to',
  ({ to, status, move }) => {
    it.effect('fails RunStatusInvalidError', () =>
      Effect.gen(function* () {
        const error = yield* move(runAt(status)).pipe(Effect.flip)

        assertSchemaEquals(
          RunStatusInvalidError,
          error,
          new RunStatusInvalidError({ id: queued.id, from: status, to }),
        )
      }),
    )
  },
)

describe.each([
  { reason: 'ReplyFailed', sentence: 'The assistant could not reply. Please try again.' },
  { reason: 'ReplyRefused', sentence: 'The assistant declined to answer this message.' },
] as const)('failRun for $reason', ({ reason, sentence }) => {
  it.effect('keeps the reason, a sentence of its own and the cause', () =>
    Effect.gen(function* () {
      const failed = yield* failRun(runAt('generating'), { reason, cause, at: later })

      assertSchemaEquals(
        Schema.Option(RunFailure),
        failed.failure,
        Option.some({ reason, message: sentence, cause }),
      )
    }),
  )
})

describe('completeRun', () => {
  it.effect('keeps the reply it settled with', () =>
    Effect.gen(function* () {
      const done = yield* completeRun(runAt('generating'), { reply, at: later })

      assertSchemaEquals(Schema.Option(Message), done.assistantMessage, Option.some(reply))
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
