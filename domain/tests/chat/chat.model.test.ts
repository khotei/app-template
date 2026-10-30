import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { ChatBusyError, ChatStatusInvalidError } from '#domain/chat/chat.error'
import { Chat, ChatTitle, failChat, idleChat, queueChat } from '#domain/chat/chat.model'
import { chat } from '#domain/testing/chat.test-fixture'

describe('queueChat', () => {
  it.effect.each([{ from: 'idle' }, { from: 'failed' }] as const)(
    'queues a chat that is $from',
    ({ from }) =>
      Effect.gen(function* () {
        const queued = yield* queueChat(new Chat({ ...chat, status: from }))

        assertEquals(queued, new Chat({ ...chat, status: 'queued' }))
      }),
  )

  it.effect('refuses a queued chat with ChatBusyError', () =>
    Effect.gen(function* () {
      const error = yield* queueChat(new Chat({ ...chat, status: 'queued' })).pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
    }),
  )
})

describe('idleChat and failChat', () => {
  it.effect.each([
    { name: 'idleChat', end: idleChat, to: 'idle' },
    { name: 'failChat', end: failChat, to: 'failed' },
  ] as const)('$name ends a queued chat as $to', ({ end, to }) =>
    Effect.gen(function* () {
      const ended = yield* end(new Chat({ ...chat, status: 'queued' }))

      assertEquals(ended, new Chat({ ...chat, status: to }))
    }),
  )

  it.effect.each([
    { name: 'idleChat', end: idleChat, from: 'idle', to: 'idle' },
    { name: 'failChat', end: failChat, from: 'failed', to: 'failed' },
  ] as const)('$name refuses a chat that is $from', ({ end, from, to }) =>
    Effect.gen(function* () {
      const error = yield* end(new Chat({ ...chat, status: from })).pipe(Effect.flip)

      assertSchemaEquals(
        ChatStatusInvalidError,
        error,
        new ChatStatusInvalidError({ id: chat.id, from, to }),
      )
    }),
  )
})

describe('ChatTitle', () => {
  it.each(['Trip', 'a'.repeat(120)])('accepts %j', (title) => {
    assert.isTrue(Schema.is(ChatTitle)(title))
  })

  it.each(['', '  ', ' Trip', 'a'.repeat(121)])('rejects %j', (title) => {
    assert.isFalse(Schema.is(ChatTitle)(title))
  })
})
