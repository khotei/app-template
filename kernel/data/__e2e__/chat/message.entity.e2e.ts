import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { flipSqlError } from '@app-template/packages/db/testing/e2e'

import { chats } from '#kernel/data/chat/chat.table'
import { type MessageColumns, messages } from '#kernel/data/chat/message.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const createdAt = new Date('2026-10-18T00:00:00.123Z')

const userId = '0192d4e0-7b3a-7c00-8000-000000000072'
const strangerId = '0192d4e0-7b3a-7c00-8000-000000000073'
const chatId = '0192d4e0-7b3a-7c00-8000-000000000071'

const message = {
  id: '0192d4e0-7b3a-7c00-8000-000000000070',
  chatId,
  userId,
  author: 'user',
  text: 'Hi',
  createdAt,
} satisfies MessageColumns

describe('messages', () => {
  it.effect('refuses a message in a chat no row holds through its key', () =>
    Effect.gen(function* () {
      const db = yield* Db

      const error = yield* flipSqlError(db.insert(messages).values(message))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'messages_chat_id_user_id_fk')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect("refuses a message of another user than its chat's through the key over both", () =>
    Effect.gen(function* () {
      const db = yield* Db
      yield* db.insert(users).values([
        { id: userId, createdAt: new Date(0) },
        { id: strangerId, createdAt: new Date(0) },
      ])
      yield* db
        .insert(chats)
        .values({ id: chatId, userId, title: null, createdAt, updatedAt: createdAt })

      const error = yield* flipSqlError(
        db.insert(messages).values({ ...message, userId: strangerId }),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'messages_chat_id_user_id_fk')
    }).pipe(Effect.provide(DbTest)),
  )
})
