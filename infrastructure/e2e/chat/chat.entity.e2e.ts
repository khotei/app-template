import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import { Chat, ChatId, maxTitleLength } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'

import { ChatInsert, chats } from '#infrastructure/chat/chat.entity'
import { Db } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db.test-layer'
import { insertUser } from '#infrastructure/testing/rows.test-util'

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000060')

const chat = new Chat({
  id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000061'),
  userId,
  title: Option.none(),
  status: 'idle',
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
  updatedAt: DateTime.makeUnsafe('2026-10-18T00:00:01.456Z'),
})

describe('chats', () => {
  it.effect.each([
    { name: 'longer than the maximum', title: 'a'.repeat(maxTitleLength + 1) },
    { name: 'empty', title: '' },
    { name: 'untrimmed', title: ' Trip' },
  ])('refuses a title that is $name through its check', ({ title }) =>
    Effect.gen(function* () {
      const db = yield* Db
      const row = Schema.encodeSync(ChatInsert)(chat)

      yield* insertUser(userId)
      const error = yield* flipSqlError(db.insert(chats).values({ ...row, title }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'chats_title_check')
    }).pipe(Effect.provide(DbTest)),
  )
})
