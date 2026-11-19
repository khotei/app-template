import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatBusyError } from '#chat/domain/chat.error'
import {
  buildChatStatus,
  Chat,
  ChatTitle,
  ensureChatNotBusy,
  isNewChat,
  renameChat,
} from '#chat/domain/chat.model'
import type { RunStatus } from '#chat/domain/run-fields.model'
import { chat, queuedRun } from '#testing/chat/chat.test-fixture'

const runAt = (status: RunStatus) => Option.some({ ...queuedRun, status })

const chatAt = (status: RunStatus) => new Chat({ ...chat, run: runAt(status) })

describe('buildChatStatus', () => {
  it('reads a chat no send has reached as idle', () => {
    assert.strictEqual(buildChatStatus(Option.none()), 'idle')
  })

  it.each([
    { status: 'queued', chatStatus: 'queued' },
    { status: 'preparing', chatStatus: 'queued' },
    { status: 'generating', chatStatus: 'queued' },
    { status: 'done', chatStatus: 'idle' },
    { status: 'failed', chatStatus: 'failed' },
  ] as const)(
    'reads a chat whose newest Run is $status as $chatStatus',
    ({ status, chatStatus }) => {
      assert.strictEqual(buildChatStatus(runAt(status)), chatStatus)
    },
  )
})

describe('isNewChat', () => {
  it('reads a chat no send has reached as new', () => {
    assert.isTrue(isNewChat(chat))
  })

  it('reads a chat with a Run as not new', () => {
    assert.isFalse(isNewChat(chatAt('done')))
  })
})

describe('ensureChatNotBusy', () => {
  it.effect('takes a chat no send has reached', () => ensureChatNotBusy(Option.none()))

  it.effect.each([{ status: 'done' }, { status: 'failed' }] as const)(
    'takes a chat whose newest Run is $status',
    ({ status }) => ensureChatNotBusy(runAt(status)),
  )

  it.effect.each([
    { status: 'queued' },
    { status: 'preparing' },
    { status: 'generating' },
  ] as const)('refuses a chat whose newest Run is $status with ChatBusyError', ({ status }) =>
    Effect.gen(function* () {
      const error = yield* ensureChatNotBusy(runAt(status)).pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
    }),
  )
})

describe('renameChat', () => {
  it('titles the chat and moves its updatedAt', () => {
    const title = ChatTitle.make('Trip')
    const at = DateTime.makeUnsafe('2026-10-18T00:00:00.000Z')

    assertEquals(
      renameChat(chat, { title, at }),
      new Chat({ ...chat, title: Option.some(title), updatedAt: at }),
    )
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
