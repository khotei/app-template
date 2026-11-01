import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { flipSqlError } from '@app-template/db/testing-e2e'

import { chats } from '#kernel/data/chat/chat.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing-e2e/db.test-layer'

const userId = '0192d4e0-7b3a-7c00-8000-000000000060'

const chat = {
  id: '0192d4e0-7b3a-7c00-8000-000000000061',
  userId,
  title: null,
  status: 'idle',
  createdAt: new Date('2026-10-18T00:00:00.123Z'),
  updatedAt: new Date('2026-10-18T00:00:01.456Z'),
} satisfies typeof chats.$inferInsert

describe('chats', () => {
  it.effect.each([
    { name: 'longer than the maximum', title: 'a'.repeat(121) },
    { name: 'empty', title: '' },
    { name: 'untrimmed', title: ' Trip' },
  ])('refuses a title that is $name through its check', ({ title }) =>
    Effect.gen(function* () {
      const db = yield* Db

      yield* db.insert(users).values({ id: userId, createdAt: new Date(0) })
      const error = yield* flipSqlError(db.insert(chats).values({ ...chat, title }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'chats_title_check')
    }).pipe(Effect.provide(DbTest)),
  )
})
