import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

import { PgClientTest } from '@app-template/packages/db/testing/e2e'

/** The limit `chats_title_check` holds, as the chat's title schema does. */
const maxTitleLength = 120

const userId = '0192d4e0-7b3a-7c00-8000-000000000060'

const chat = {
  id: '0192d4e0-7b3a-7c00-8000-000000000061',
  userId,
  title: null as string | null,
  createdAt: new Date('2026-10-18T00:00:00.123Z'),
  updatedAt: new Date('2026-10-18T00:00:01.456Z'),
}

const insertUser = SqlClient.SqlClient.use(
  (sql) => sql`insert into users ${sql.insert({ id: userId, createdAt: new Date(0) })}`,
)

const insertChat = (row: typeof chat) =>
  SqlClient.SqlClient.use((sql) => sql`insert into chats ${sql.insert(row)}`)

describe('chats', () => {
  it.effect('accepts a title of the maximum length through its check', () =>
    Effect.gen(function* () {
      yield* insertUser
      yield* insertChat({ ...chat, title: 'a'.repeat(maxTitleLength) })
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect.each([
    { name: 'longer than the maximum', title: 'a'.repeat(maxTitleLength + 1) },
    { name: 'empty', title: '' },
    { name: 'untrimmed', title: ' Trip' },
  ])('refuses a title that is $name through its check', ({ title }) =>
    Effect.gen(function* () {
      yield* insertUser
      const error = yield* insertChat({ ...chat, title }).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'chats_title_check')
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect('refuses a chat of a user no row holds through its key', () =>
    Effect.gen(function* () {
      const error = yield* insertChat(chat).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'chats_user_id_users_id_fkey')
    }).pipe(Effect.provide(PgClientTest)),
  )
})
