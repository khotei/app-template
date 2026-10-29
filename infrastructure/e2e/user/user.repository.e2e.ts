import { assert, describe, it } from '@effect/vitest'
import { Cause, DateTime, Effect, Exit, Layer, Option, Schema } from 'effect'

import {
  buildUser,
  Credential,
  SecretHash,
  User,
  UserId,
  UserRepository,
} from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { Db, isSqlError } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db.test-layer'
import { credentials, users } from '#infrastructure/user/user.entity'
import { UserRepositoryPg } from '#infrastructure/user/user.repository'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const user = (id: string) => buildUser({ id: UserId.make(id), createdAt })

const credential = (hex: string) =>
  new Credential({ kind: 'secret', hash: SecretHash.make(hex.repeat(64)) })

const SelectedUser = Schema.Option(User)

const UserRepositoryPgTest = UserRepositoryPg.pipe(Layer.provide(DbTest))

describe('UserRepositoryPg', () => {
  it.effect('selects an inserted user back by its id and by its credential', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000010')

      yield* users.insert(ada, credential('a'))
      const byId = yield* users.selectById(ada.id)
      const byCredential = yield* users.selectByCredential(credential('a'))

      assertSchemaEquals(SelectedUser, byId, Option.some(ada))
      assertSchemaEquals(SelectedUser, byCredential, Option.some(ada))
    }).pipe(Effect.provide(UserRepositoryPgTest)),
  )

  it.effect('selects none for an unknown credential or id', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository

      yield* users.insert(user('0192d4e0-7b3a-7c00-8000-000000000011'), credential('a'))
      const byCredential = yield* users.selectByCredential(credential('b'))
      const byId = yield* users.selectById(UserId.make('0192d4e0-7b3a-7c00-8000-000000000019'))

      assert.deepStrictEqual(byCredential, Option.none())
      assert.deepStrictEqual(byId, Option.none())
    }).pipe(Effect.provide(UserRepositoryPgTest)),
  )
  it.effect(
    'writes no user when its credential is taken, since both rows share a transaction',
    () =>
      Effect.gen(function* () {
        const users = yield* UserRepository
        const bob = user('0192d4e0-7b3a-7c00-8000-000000000014')

        yield* users.insert(user('0192d4e0-7b3a-7c00-8000-000000000013'), credential('a'))
        const inserted = yield* Effect.exit(users.insert(bob, credential('a')))
        const selected = yield* users.selectById(bob.id)

        assert.isTrue(Exit.hasDies(inserted))
        const defect = Exit.isFailure(inserted) ? Cause.squash(inserted.cause) : undefined
        if (!isSqlError(defect)) return assert.fail(`expected a SqlError defect, got ${defect}`)
        assert.strictEqual(defect.reason._tag, 'UniqueViolation')
        assert.deepStrictEqual(selected, Option.none())
      }).pipe(Effect.provide(UserRepositoryPgTest)),
  )

  it.effect('rejects a credentials.hash that is not lower-case hex, through its check', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000012')

      yield* db.insert(users).values({ id: ada.id, createdAt: new Date(0) })
      const error = yield* flipSqlError(
        db.insert(credentials).values({ hash: 'A'.repeat(64), kind: 'secret', userId: ada.id }),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'credentials_hash_check')
    }).pipe(Effect.provide(DbTest)),
  )
})
