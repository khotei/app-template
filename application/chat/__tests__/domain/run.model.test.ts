import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Equal, Option, Schema } from 'effect'

import { UserId } from '@app-template/application/identity'
import { encodeWith } from '@app-template/packages/schema'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { Run, type RunStatus } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'

const createdAt = DateTime.makeUnsafe('2026-11-09T00:00:00.000Z')

const queued = new Run({
  id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000001'),
  chatId: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000002'),
  userId: UserId.make('0192d4e0-7b3a-7c00-8000-000000000005'),
  userMessageId: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000003'),
  status: 'queued',
  failure: Option.none(),
  assistantMessageId: Option.none(),
  createdAt,
  updatedAt: createdAt,
})

const runAt = (status: RunStatus) => new Run({ ...queued, status })

describe('Run', () => {
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

  it('compares by its fields alone', () => {
    assert.isTrue(Equal.equals(runAt('done'), runAt('done')))
    assert.sameMembers(Object.keys(queued), Object.keys(Run.fields))
  })
})
