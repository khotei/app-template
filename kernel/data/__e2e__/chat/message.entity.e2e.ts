import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { flipSqlError } from '@app-template/packages/db/testing/e2e'

import { messages } from '#kernel/data/chat/message.table'
import { Db } from '#kernel/data/db.client'
import { DbTest } from '#testing/data/e2e/db.test-layer'

describe('messages', () => {
  it.effect('refuses a message in a chat no row holds through its key', () =>
    Effect.gen(function* () {
      const db = yield* Db

      const error = yield* flipSqlError(
        db.insert(messages).values({
          id: '0192d4e0-7b3a-7c00-8000-000000000070',
          chatId: '0192d4e0-7b3a-7c00-8000-000000000071',
          author: 'user',
          text: 'Hi',
          createdAt: new Date('2026-10-18T00:00:00.123Z'),
        }),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'messages_chat_id_chats_id_fkey')
    }).pipe(Effect.provide(DbTest)),
  )
})
