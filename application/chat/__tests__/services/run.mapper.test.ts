import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { MessageId } from '#chat/domain/chat.id'
import { buildAssistantMessage } from '#chat/domain/message.model'
import { Run, RunFailure, RunStatus } from '#chat/domain/run.model'
import { RunFromEntity } from '#chat/services/run.mapper'
import { queuedRun } from '#testing/chat/chat.test-fixture'

const run = new Run({
  ...queuedRun,
  updatedAt: DateTime.makeUnsafe('2026-11-09T00:00:01.456Z'),
})

const reply = buildAssistantMessage({
  id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000201'),
  chatId: run.chatId,
  runId: run.id,
  text: 'Hello',
  createdAt: run.updatedAt,
})

const failure = new RunFailure({ reason: 'ReplyRefused', message: 'Declined', cause: 'refusal' })

describe('RunFromEntity', () => {
  it.effect.each(
    RunStatus.literals.map((status) => ({
      status,
      failure: status === 'failed' ? Option.some(failure) : Option.none(),
      assistantMessage: status === 'done' ? Option.some(reply) : Option.none(),
    })),
  )(
    '$status: encodes a Run with its messages and reads it back',
    ({ status, failure, assistantMessage }) =>
      Effect.gen(function* () {
        const written = new Run({ ...run, status, failure, assistantMessage })

        const row = yield* Schema.encodeEffect(RunFromEntity)(written)
        const read = yield* Schema.decodeUnknownEffect(RunFromEntity)(row)

        assertSchemaEquals(Run, read, written)
      }),
  )
})
