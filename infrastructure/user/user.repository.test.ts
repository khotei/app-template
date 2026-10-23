import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Cause, DateTime, Effect, Exit, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  buildUser,
  Credential,
  SecretHash,
  User,
  UserId,
  UserRepository,
} from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { DbTest } from '#infrastructure/db/testing/db'
import { credentials, users } from '#infrastructure/user/user.entity'
import { UserRepositoryKv, UserRepositoryPg } from '#infrastructure/user/user.repository'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const user = (id: string) => buildUser({ id: UserId.make(id), createdAt })

const credential = (hex: string) =>
  new Credential({ kind: 'secret', hash: SecretHash.make(hex.repeat(64)) })

const SelectedUser = Schema.Option(User)

const UserRepositoryOnDbTest = UserRepositoryPg.pipe(Layer.provide(DbTest))

describe.each([
  {
    name: 'UserRepositoryKv',
    repository: UserRepositoryKv.pipe(Layer.provide(KeyValueStore.layerMemory)),
  },
  { name: 'UserRepositoryPg', repository: UserRepositoryOnDbTest },
])('$name', ({ repository }) => {
  it.effect('selects an inserted user back by its id and by its credential', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000010')

      yield* users.insert(ada, credential('a'))

      assertSchemaEquals(SelectedUser, yield* users.selectById(ada.id), Option.some(ada))
      assertSchemaEquals(
        SelectedUser,
        yield* users.selectByCredential(credential('a')),
        Option.some(ada),
      )
    }).pipe(Effect.provide(repository)),
  )

  it.effect('selects none for an unknown credential or id', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository

      yield* users.insert(user('0192d4e0-7b3a-7c00-8000-000000000011'), credential('a'))

      assert.deepStrictEqual(yield* users.selectByCredential(credential('b')), Option.none())
      assert.deepStrictEqual(
        yield* users.selectById(UserId.make('0192d4e0-7b3a-7c00-8000-000000000019')),
        Option.none(),
      )
    }).pipe(Effect.provide(repository)),
  )
})

describe('UserRepositoryPg and its tables', () => {
  it.effect(
    'writes no user when its credential is taken, since both rows share a transaction',
    () =>
      Effect.gen(function* () {
        const users = yield* UserRepository
        const bob = user('0192d4e0-7b3a-7c00-8000-000000000014')

        yield* users.insert(user('0192d4e0-7b3a-7c00-8000-000000000013'), credential('a'))
        const inserted = yield* Effect.exit(users.insert(bob, credential('a')))

        assert.isTrue(Exit.hasDies(inserted))
        assert.deepStrictEqual(yield* users.selectById(bob.id), Option.none())
      }).pipe(Effect.provide(UserRepositoryOnDbTest)),
  )

  it.effect('leave created_at to the domain, with no database default', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const columns = yield* db.execute<{ column_default: string | null }>(
        sql`select column_default from information_schema.columns
            where table_name = 'users' and column_name = 'created_at'`,
        'objects',
      )
      assert.deepStrictEqual(columns, [{ column_default: null }])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('reject a credential hash that is not lower-case hex', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const ada = user('0192d4e0-7b3a-7c00-8000-000000000012')
      yield* db.insert(users).values({ id: ada.id, createdAt: new Date(0) })

      const error = yield* Effect.flip(
        db.insert(credentials).values({ hash: 'A'.repeat(64), kind: 'secret', userId: ada.id }),
      )

      // Drizzle types the driver's failure as `unknown`; it is the `Cause` of a `SqlError`.
      assert.isTrue(Cause.isCause(error.cause))
      assert.include(Cause.pretty(error.cause as Cause.Cause<unknown>), 'credentials_hash_check')
    }).pipe(Effect.provide(DbTest)),
  )
})
