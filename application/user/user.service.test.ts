import { createHash } from 'node:crypto'

import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option, Redacted, Result } from 'effect'
import { Base64Url } from 'effect/encoding'

import { Credential, SecretHash, UserRepository, UserUnknownError } from '@app-template/domain/user'
import { Db } from '@app-template/infrastructure/db'
import { UserPg } from '@app-template/infrastructure/user'
import { assertSchemaEquals, isUuidV7 } from '@app-template/testing'

import { epoch } from '#application/testing/chat.fixture'
import { DbTest } from '#application/testing/db.harness'
import { type UserSecret, UserService } from '#application/user/user.service'

const UserServiceTest = UserService.layer.pipe(
  Layer.provideMerge(UserPg),
  Layer.provide(BunCrypto.layer),
  Layer.provideMerge(DbTest),
)

const countStoredRows = Effect.flatMap(Db, (db) =>
  Effect.all([
    db.query.users.findMany({ columns: { id: true } }),
    db.query.credentials.findMany({ columns: { hash: true } }),
  ]),
).pipe(
  Effect.map(([users, credentials]) => ({ users: users.length, credentials: credentials.length })),
  Effect.orDie,
)

const unknownSecret = Redacted.make('q3Jx0V8m2bZ9yT_4kW-1sN7uP5oA6dLcE0fG8hI2jK4')

const buildCredentialWithNode = (secret: UserSecret) =>
  new Credential({
    kind: 'secret',
    hash: SecretHash.make(createHash('sha256').update(Redacted.value(secret)).digest('hex')),
  })

describe('UserService', () => {
  it.effect('ensure(none) creates a user with a UUIDv7 id at the clock time and a secret', () =>
    Effect.gen(function* () {
      const service = yield* UserService

      const { user, secret } = yield* service.ensure(Option.none())

      assert.isTrue(isUuidV7(user.id))
      assertEquals(user.createdAt, epoch)
      assert.match(Redacted.value(secret), /^[A-Za-z0-9_-]{43}$/)
      assert.deepStrictEqual(
        Result.map(Base64Url.decode(Redacted.value(secret)), (bytes) => bytes.length),
        Result.succeed(32),
      )
    }).pipe(Effect.provide(UserServiceTest)),
  )

  it.effect('stores only the hex SHA-256 of the secret and recognises the secret back', () =>
    Effect.gen(function* () {
      const service = yield* UserService
      const { user, secret } = yield* service.ensure(Option.none())

      assertEquals(
        yield* (yield* UserRepository).selectByCredential(buildCredentialWithNode(secret)),
        Option.some(user),
      )
      assertEquals(yield* service.authenticate(secret), user)
    }).pipe(Effect.provide(UserServiceTest)),
  )

  it.live('ensure(some(secret)) returns the same user and secret without a second record', () =>
    Effect.gen(function* () {
      const service = yield* UserService
      const first = yield* service.ensure(Option.none())
      const stored = yield* countStoredRows

      const second = yield* service.ensure(Option.some(first.secret))

      assertEquals(second.user, first.user)
      assert.strictEqual(Redacted.value(second.secret), Redacted.value(first.secret))
      assert.deepStrictEqual(yield* countStoredRows, stored)
    }).pipe(Effect.provide(UserServiceTest)),
  )

  it.effect('ensure(some(unknown)) creates a new user with a new secret', () =>
    Effect.gen(function* () {
      const service = yield* UserService
      const { user, secret } = yield* service.ensure(Option.some(unknownSecret))

      assert.notStrictEqual(Redacted.value(secret), Redacted.value(unknownSecret))
      assertEquals(yield* service.authenticate(secret), user)
    }).pipe(Effect.provide(UserServiceTest)),
  )

  it.effect('authenticate of an unknown secret is UserUnknownError', () =>
    Effect.gen(function* () {
      const service = yield* UserService

      const error = yield* Effect.flip(service.authenticate(unknownSecret))

      assertSchemaEquals(UserUnknownError, error, new UserUnknownError())
    }).pipe(Effect.provide(UserServiceTest)),
  )
})
