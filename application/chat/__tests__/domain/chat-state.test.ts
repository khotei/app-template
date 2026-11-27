import { assert, describe, it } from '@effect/vitest'
import { Option } from 'effect'

import { ChatState } from '#chat/domain/chat-state'
import { chat, queuedRun } from '#testing/chat/chat.test-fixture'

describe('ChatState.build', () => {
  it('reads a chat no ask has reached as idle', () => {
    assert.strictEqual(ChatState.build(Option.none()), 'idle')
  })

  it.each([
    { status: 'queued', state: 'queued' },
    { status: 'generating', state: 'queued' },
    { status: 'done', state: 'idle' },
    { status: 'failed', state: 'failed' },
  ] as const)('reads a chat whose newest Run is $status as $state', ({ status, state }) => {
    assert.strictEqual(ChatState.build(Option.some({ status })), state)
  })
})

describe('ChatState.isNew', () => {
  it('reads a chat no ask has reached as new', () => {
    assert.isTrue(ChatState.isNew(chat))
  })

  it('reads a chat with a Run as not new', () => {
    assert.isFalse(ChatState.isNew({ run: Option.some(queuedRun) }))
  })
})
