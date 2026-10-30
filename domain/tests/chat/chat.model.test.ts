import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { ChatBusyError, ChatStatusInvalidError } from '#domain/chat/chat.error'
import {
  buildChatTitle,
  Chat,
  ChatTitle,
  failChat,
  idleChat,
  maxTitleLength,
  queueChat,
} from '#domain/chat/chat.model'
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

const filler = (length: number) => 'A'.repeat(length)

// The limit counts code units; each emoji is one grapheme, 😀 two code units and the joined
// family eight. Every text is 300 graphemes long.
const cuts = [
  {
    name: 'an emoji that fits',
    text: `${filler(maxTitleLength - 2)}😀${filler(300 - maxTitleLength + 1)}`,
    title: `${filler(maxTitleLength - 2)}😀`,
  },
  {
    name: 'an emoji across the limit',
    text: `${filler(maxTitleLength - 1)}😀${filler(300 - maxTitleLength)}`,
    title: filler(maxTitleLength - 1),
  },
  {
    name: 'a joined emoji across the limit',
    text: `${filler(maxTitleLength - 5)}👨‍👩‍👧${filler(300 - maxTitleLength + 4)}`,
    title: filler(maxTitleLength - 5),
  },
] as const

describe('buildChatTitle', () => {
  it.each(cuts)('cuts a 300-grapheme text at a whole grapheme with $name', ({ text, title }) => {
    assert.deepStrictEqual(buildChatTitle(text), Option.some(ChatTitle.make(title)))
  })

  it('trims before the cut and after it', () => {
    const text = `  ${filler(maxTitleLength - 1)} and more\n`
    assert.deepStrictEqual(
      buildChatTitle(text),
      Option.some(ChatTitle.make(filler(maxTitleLength - 1))),
    )
  })

  it.each(['', ' \n '])('refuses the blank text %j', (text) => {
    assert.isTrue(buildChatTitle(text).pipe(Option.isNone))
  })
})
