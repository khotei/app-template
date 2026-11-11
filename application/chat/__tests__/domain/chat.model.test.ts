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
  renameChat,
} from '#chat/domain/chat.model'
import { Run } from '#chat/domain/run.model'
import type { RunStatus } from '#chat/domain/run-fields.model'
import { chat, queuedRun } from '#testing/chat/chat.test-fixture'

const chatAt = (status: RunStatus) =>
  new Chat({ ...chat, latestRun: Option.some(new Run({ ...queuedRun, status })) })

describe('buildChatStatus', () => {
  it('reads a chat no send has reached as idle', () => {
    assert.strictEqual(buildChatStatus(chat), 'idle')
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
      assert.strictEqual(buildChatStatus(chatAt(status)), chatStatus)
    },
  )
})

describe('ensureChatNotBusy', () => {
  it.effect.each([{ status: 'done' }, { status: 'failed' }] as const)(
    'takes a chat whose newest Run is $status',
    ({ status }) => ensureChatNotBusy(chatAt(status)),
  )

  it.effect.each([
    { status: 'queued' },
    { status: 'preparing' },
    { status: 'generating' },
  ] as const)('refuses a chat whose newest Run is $status with ChatBusyError', ({ status }) =>
    Effect.gen(function* () {
      const error = yield* ensureChatNotBusy(chatAt(status)).pipe(Effect.flip)

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
  it.effect.each([{ title: 'Trip' }, { title: 'a'.repeat(120) }])('accepts $title', ({ title }) =>
    Effect.sync(() => assert.isTrue(Schema.is(ChatTitle)(title))),
  )

  it.effect.each([{ title: '' }, { title: '  ' }, { title: ' Trip' }, { title: 'a'.repeat(121) }])(
    'rejects $title',
    ({ title }) => Effect.sync(() => assert.isFalse(Schema.is(ChatTitle)(title))),
  )
})
