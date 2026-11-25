import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Equal, Option, Schema } from 'effect'

import { encodeWith } from '@app-template/packages/schema'

import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { Run, type RunStatus } from '#chat/domain/run.model'
import { chat, queuedRun } from '#testing/chat/chat.test-fixture'

const runAt = (status: RunStatus) => Option.some(new Run({ ...queuedRun, status }))

const chatAt = (status: RunStatus) => new Chat({ ...chat, run: runAt(status) })

describe('Chat', () => {
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
