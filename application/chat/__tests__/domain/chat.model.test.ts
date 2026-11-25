import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Equal, Option, Schema } from 'effect'

import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import {
  buildChatStatus,
  Chat,
  ChatBusyError,
  ChatTitle,
  ensureChatNotBusy,
  isNewChat,
} from '#chat/domain/chat.model'
import { Run, RunNotRetryableError, type RunStatus } from '#chat/domain/run.model'
import { chat, queuedRun } from '#testing/chat/chat.test-fixture'

const runAt = (status: RunStatus) => Option.some(new Run({ ...queuedRun, status }))

const chatAt = (status: RunStatus) => new Chat({ ...chat, run: runAt(status) })

describe('buildChatStatus', () => {
  it('reads a chat no ask has reached as idle', () => {
    assert.strictEqual(buildChatStatus(Option.none()), 'idle')
  })

  it.each([
    { status: 'queued', chatStatus: 'queued' },
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
  it('reads a chat no ask has reached as new', () => {
    assert.isTrue(isNewChat(Option.none()))
  })

  it('reads a chat with a Run as not new', () => {
    assert.isFalse(isNewChat(runAt('done')))
  })
})

describe('ensureChatNotBusy', () => {
  it.effect('takes a chat no ask has reached', () => ensureChatNotBusy(Option.none()))

  it.effect.each([{ status: 'done' }, { status: 'failed' }] as const)(
    'takes a chat whose newest Run is $status',
    ({ status }) => ensureChatNotBusy(runAt(status)),
  )

  it.effect.each([{ status: 'queued' }, { status: 'generating' }] as const)(
    'refuses a chat whose newest Run is $status with ChatBusyError',
    ({ status }) =>
      Effect.gen(function* () {
        const error = yield* ensureChatNotBusy(runAt(status)).pipe(Effect.flip)

        assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      }),
  )
})

describe('a rule function over a plain struct of the fields it reads', () => {
  it.effect('reads a chat from a newest Run of only the fields its rule reads', () =>
    Effect.gen(function* () {
      const error = yield* ensureChatNotBusy(
        Option.some({ chatId: chat.id, status: 'queued' }),
      ).pipe(Effect.flip)

      assert.strictEqual(buildChatStatus(Option.some({ status: 'failed' })), 'failed')
      assert.isFalse(isNewChat(Option.some({ ...queuedRun })))
      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
    }),
  )
})

describe('Chat', () => {
  it('reads its status and newness from its newest Run', () => {
    assert.deepStrictEqual(
      [chat.status, chat.isNew, chatAt('failed').status, chatAt('failed').isNew],
      ['idle', true, 'failed', false],
    )
  })

  it.effect('refuses an ask while its newest Run is in work with ChatBusyError', () =>
    Effect.gen(function* () {
      const error = yield* chatAt('generating').ensureNotBusy().pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
    }),
  )

  it.effect('takes its failed newest Run for a retry, and refuses one with none', () =>
    Effect.gen(function* () {
      const failed = chatAt('failed')

      assert.deepStrictEqual(yield* failed.ensureRetryable(), Option.getOrThrow(failed.run))
      assertSchemaEquals(
        RunNotRetryableError,
        yield* chat.ensureRetryable().pipe(Effect.flip),
        new RunNotRetryableError(),
      )
    }),
  )

  it.effect('decodes the rows it reads into Chats, and dies on a row that does not decode', () =>
    Effect.gen(function* () {
      const row = yield* encodeWith(Chat)(chatAt('done'))

      const one = yield* Chat.decodeOne(Option.some(row))
      const [many] = yield* Chat.decodeMany([row])
      const defect = yield* Chat.decodeOne(Option.some({ ...row, id: 'not-a-uuid' })).pipe(
        Effect.catchDefect(Effect.succeed),
      )

      assert.instanceOf(Option.getOrThrow(one), Chat)
      assert.instanceOf(many, Chat)
      assert.isTrue(Equal.equals(Option.getOrThrow(one), chatAt('done')))
      assert.isTrue(Schema.isSchemaError(defect))
    }),
  )

  it.effect('makes the update row of a Chat as it holds it, its updatedAt moved to now', () =>
    Effect.gen(function* () {
      const read = new Chat({ ...chat, updatedAt: DateTime.makeUnsafe('2026-11-09T00:00:00.000Z') })

      const { set, row } = yield* Chat.makeUpdate(read)

      assert.deepStrictEqual(
        [DateTime.toEpochMillis(set.updatedAt), row.updatedAt.getTime()],
        [0, 0],
      )
    }),
  )

  it('compares by its fields alone, its members adding none', () => {
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
