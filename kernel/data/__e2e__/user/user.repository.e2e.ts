import { assert, describe, it } from '@effect/vitest'
import { Cause, Effect, Exit, Layer, Option, Schema } from 'effect'
import { SqlError } from 'effect/sql'

import { flipSqlError } from '@app-template/packages/db/testing/e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { Db } from '#kernel/data/db.client'
import { UserEntity, type UserEntityCredential } from '#kernel/data/user/user.entity'
import { UserRepository } from '#kernel/data/user/user.repository'
import { credentials, users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const createdAt = new Date('2026-10-18T00:00:00.123Z')

const user = (id: string): UserEntity => ({ id, createdAt })

const credential = (hex: string): UserEntityCredential => ({
  kind: 'secret',
  hash: hex.repeat(64),
})

const SelectedUser = Schema.Option(UserEntity)

const UserRepositoryDbTest = UserRepository.layer.pipe(Layer.provide(DbTest))

describe('UserRepository', () => {
  it.effect('selects an inserted user back by its id and by its credential', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000010')

      yield* users.insert(ada)
      yield* users.insertCredential({ ...credential('a'), userId: ada.id })
      const byId = yield* users.selectOne({ id: ada.id })
      const byCredential = yield* users.selectOne({ credentials: credential('a') })

      assertSchemaEquals(SelectedUser, byId, Option.some(ada))
      assertSchemaEquals(SelectedUser, byCredential, Option.some(ada))
    }).pipe(Effect.provide(UserRepositoryDbTest)),
  )

  it.effect('selects none for an unknown credential or id', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000011')

      yield* users.insert(ada)
      yield* users.insertCredential({ ...credential('a'), userId: ada.id })
      const byCredential = yield* users.selectOne({ credentials: credential('b') })
      const byId = yield* users.selectOne({
        id: '0192d4e0-7b3a-7c00-8000-000000000019',
      })

      assert.deepStrictEqual(byCredential, Option.none())
      assert.deepStrictEqual(byId, Option.none())
    }).pipe(Effect.provide(UserRepositoryDbTest)),
  )
  it.effect("selects none for an id with another user's credential", () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000015')
      const bob = user('0192d4e0-7b3a-7c00-8000-000000000016')

      yield* users.insert(ada)
      yield* users.insertCredential({ ...credential('a'), userId: ada.id })
      yield* users.insert(bob)
      yield* users.insertCredential({ ...credential('b'), userId: bob.id })
      const selected = yield* users.selectOne({ id: ada.id, credentials: credential('b') })

      assert.deepStrictEqual(selected, Option.none())
    }).pipe(Effect.provide(UserRepositoryDbTest)),
  )

  it.effect('dies with a UniqueViolation on a credential another user holds', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000013')
      const bob = user('0192d4e0-7b3a-7c00-8000-000000000014')

      yield* users.insert(ada)
      yield* users.insertCredential({ ...credential('a'), userId: ada.id })
      yield* users.insert(bob)

      const inserted = yield* users
        .insertCredential({ ...credential('a'), userId: bob.id })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(inserted))
      const defect = Exit.isFailure(inserted) ? Cause.squash(inserted.cause) : undefined
      assert(SqlError.isSqlError(defect), `expected a SqlError defect, got ${defect}`)
      assert.strictEqual(defect.reason._tag, 'UniqueViolation')
    }).pipe(Effect.provide(UserRepositoryDbTest)),
  )

  it.effect('accepts a credentials.hash of every hex digit, through its check', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000015')

      yield* users.insert(ada)
      yield* users.insertCredential({
        kind: 'secret',
        hash: '0123456789abcdef'.repeat(4),
        userId: ada.id,
      })
    }).pipe(Effect.provide(UserRepositoryDbTest)),
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

  it.effect('rejects a credential of a user no row holds, through its key', () =>
    Effect.gen(function* () {
      const db = yield* Db

      const error = yield* flipSqlError(
        db.insert(credentials).values({
          ...credential('a'),
          userId: '0192d4e0-7b3a-7c00-8000-000000000017',
        }),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'credentials_user_id_users_id_fkey')
    }).pipe(Effect.provide(DbTest)),
  )
})
