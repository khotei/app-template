import { assert, describe, it } from '@effect/vitest'
import { DateTime, Equal, Option } from 'effect'

import { UserId } from '@app-template/application/identity/contract'

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
  it('compares by its fields alone', () => {
    assert.isTrue(Equal.equals(runAt('done'), runAt('done')))
    assert.sameMembers(Object.keys(queued), Object.keys(Run.fields))
  })
})
