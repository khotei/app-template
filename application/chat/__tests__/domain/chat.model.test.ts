import { assert, describe, it } from '@effect/vitest'
import { Equal, Option, Schema } from 'effect'

import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { Run, type RunStatus } from '#chat/domain/run.model'
import { chat, queuedRun } from '#testing/chat/chat.test-fixture'

const runAt = (status: RunStatus) => Option.some(new Run({ ...queuedRun, status }))

const chatAt = (status: RunStatus) => new Chat({ ...chat, run: runAt(status) })

describe('Chat', () => {
  it('compares by its fields alone', () => {
    assert.isTrue(Equal.equals(chatAt('done'), chatAt('done')))
    assert.sameMembers(Object.keys(chat), Object.keys(Chat.fields))
  })
})

describe('ChatTitle', () => {
  it.each([{ title: 'Trip' }, { title: 'a'.repeat(120) }])('accepts $title', ({ title }) => {
    assert.isTrue(Schema.is(ChatTitle)(title))
  })

  it.each([
    { title: '' },
    { title: '  ' },
    { title: ' Trip' },
    { title: 'a'.repeat(121) },
    { title: 'a\u0000b' },
  ])('rejects $title', ({ title }) => {
    assert.isFalse(Schema.is(ChatTitle)(title))
  })
})
