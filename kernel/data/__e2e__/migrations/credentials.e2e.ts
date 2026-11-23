import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

import { PgClientTest } from '@app-template/packages/db/testing/e2e'

const userId = '0192d4e0-7b3a-7c00-8000-000000000012'

const insertCredential = (credential: { readonly hash: string; readonly userId: string }) =>
  SqlClient.SqlClient.use(
    (sql) => sql`insert into credentials ${sql.insert({ ...credential, kind: 'secret' })}`,
  )

describe('credentials', () => {
  it.effect('rejects a credentials.hash that is not lower-case hex, through its check', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      yield* sql`insert into users ${sql.insert({ id: userId, createdAt: new Date(0) })}`
      const error = yield* insertCredential({ hash: 'A'.repeat(64), userId }).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'credentials_hash_check')
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect('rejects a credential of a user no row holds, through its key', () =>
    Effect.gen(function* () {
      const error = yield* insertCredential({ hash: 'a'.repeat(64), userId }).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'credentials_user_id_users_id_fkey')
    }).pipe(Effect.provide(PgClientTest)),
  )
})
