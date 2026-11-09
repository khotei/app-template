import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { ReplyProvenance } from '#chat/domain/assistant.port'
import { ChatId, MessageId, RunId } from '#chat/domain/chat.id'
import { Run, RunFailure, RunStatus } from '#chat/domain/run.model'
import { encodeRun, RunFromEntity } from '#chat/services/run.mapper'

const run = new Run({
  id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000301'),
  chatId: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000101'),
  userMessageId: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000201'),
  status: 'queued',
  failure: Option.none(),
  provenance: new ReplyProvenance({ provider: 'anthropic', model: 'haiku', instructionsHash: 'h' }),
  createdAt: DateTime.makeUnsafe('2026-11-09T00:00:00.123Z'),
  updatedAt: DateTime.makeUnsafe('2026-11-09T00:00:01.456Z'),
})

const failure = new RunFailure({ reason: 'ReplyRefused', message: 'Declined', cause: 'refusal' })

describe('RunFromEntity', () => {
  it.effect.each(
    RunStatus.literals.map((status) => ({
      status,
      failure: status === 'failed' ? Option.some(failure) : Option.none(),
    })),
  )('$status: encodes a Run for runs and reads it back', ({ status, failure }) =>
    Effect.gen(function* () {
      const written = new Run({ ...run, status, failure })

      const row = yield* encodeRun(written)
      const read = yield* Schema.decodeUnknownEffect(RunFromEntity)(row)

      assertSchemaEquals(Run, read, written)
    }),
  )
})
