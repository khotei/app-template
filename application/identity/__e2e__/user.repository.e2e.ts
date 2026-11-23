import { assert, describe, it } from '@effect/vitest'
import { Cause, DateTime, Effect, Exit, Layer, Option, Schema } from 'effect'
import { Model } from 'effect/schema'
import { SqlClient, SqlError } from 'effect/sql'

import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { UserId } from '#identity/contract/user.util'
import { User } from '#identity/domain/user.model'
import { type UserCredential, UserRepository } from '#identity/services/user.repository'

const createdAt = Model.Override(DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'))

const user = (id: string) => User.insert.make({ id: UserId.make(id), createdAt })

const credential = (hex: string): UserCredential => ({ kind: 'secret', hash: hex.repeat(64) })

const SelectedUser = Schema.Option(User)

const UserRepositoryTest = UserRepository.layer.pipe(Layer.provideMerge(PgClientTest))

describe('UserRepository', () => {
  it.effect('selects an inserted user back by its credential', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000010')

      yield* users.insert(ada, credential('a'))
      const byCredential = yield* users.selectOne(credential('a'))

      assertSchemaEquals(SelectedUser, byCredential, Option.some(new User(ada)))
    }).pipe(Effect.provide(UserRepositoryTest)),
  )

  it.effect('selects none for an unknown credential', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository

      yield* users.insert(user('0192d4e0-7b3a-7c00-8000-000000000011'), credential('a'))

      assert.deepStrictEqual(yield* users.selectOne(credential('b')), Option.none())
    }).pipe(Effect.provide(UserRepositoryTest)),
  )

  it.effect(
    'writes no user when its credential is taken, since both rows share a transaction',
    () =>
      Effect.gen(function* () {
        const users = yield* UserRepository
        const sql = yield* SqlClient.SqlClient
        const bob = user('0192d4e0-7b3a-7c00-8000-000000000014')

        yield* users.insert(user('0192d4e0-7b3a-7c00-8000-000000000013'), credential('a'))
        const inserted = yield* users.insert(bob, credential('a')).pipe(Effect.exit)
        const selected = yield* sql`select id from users where id = ${bob.id}`

        assert.isTrue(Exit.hasDies(inserted))
        const defect = Exit.isFailure(inserted) ? Cause.squash(inserted.cause) : undefined
        assert(SqlError.isSqlError(defect), `expected a SqlError defect, got ${defect}`)
        assert.strictEqual(defect.reason._tag, 'UniqueViolation')
        assert.deepStrictEqual(selected, [])
      }).pipe(Effect.provide(UserRepositoryTest)),
  )

  it.effect('accepts a credentials.hash of every hex digit, through its check', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository

      yield* users.insert(user('0192d4e0-7b3a-7c00-8000-000000000015'), {
        kind: 'secret',
        hash: '0123456789abcdef'.repeat(4),
      })
    }).pipe(Effect.provide(UserRepositoryTest)),
  )
})
