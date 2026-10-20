import { createHash } from 'node:crypto'

import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, layer } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option, Redacted, Result } from 'effect'
import { Base64Url } from 'effect/encoding'
import { KeyValueStore } from 'effect/persistence'
import { TestClock, TestCrypto } from 'effect/testing'

import { Credential, SecretHash, UserRepository, UserUnknownError } from '@app-template/domain/user'
import { UserRepositoryKv } from '@app-template/infrastructure/user'
import { assertSchemaEquals, isUuidV7 } from '@app-template/testing'

import { type UserSecret, UserService } from '#application/user/user.service'

const UserServiceTest = UserService.layer.pipe(
  Layer.provideMerge(UserRepositoryKv),
  Layer.provide(TestCrypto.layer('user-service').pipe(Layer.provide(BunCrypto.layer))),
  Layer.provideMerge(KeyValueStore.layerMemory),
)

const unknownSecret = Redacted.make('q3Jx0V8m2bZ9yT_4kW-1sN7uP5oA6dLcE0fG8hI2jK4')

const buildCredentialWithNode = (secret: UserSecret) =>
  new Credential({
    kind: 'secret',
    hash: SecretHash.make(createHash('sha256').update(Redacted.value(secret)).digest('hex')),
  })

describe('UserService', () => {
  layer(UserServiceTest)((it) => {
    it.effect('ensure(none) creates a user with a UUIDv7 id at the clock time and a secret', () =>
      Effect.gen(function* () {
        const service = yield* UserService
        const now = DateTime.makeUnsafe('2026-10-18T12:00:00.000Z')
        yield* TestClock.setTime(DateTime.toEpochMillis(now))

        const { user, secret } = yield* service.ensure(Option.none())

        assert.isTrue(isUuidV7(user.id))
        assertEquals(user.createdAt, now)
        assert.match(Redacted.value(secret), /^[A-Za-z0-9_-]{43}$/)
        assert.deepStrictEqual(
          Result.map(Base64Url.decode(Redacted.value(secret)), (bytes) => bytes.length),
          Result.succeed(32),
        )
      }),
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
      }),
    )

    it.effect('ensure(some(secret)) returns the same user and secret without a second record', () =>
      Effect.gen(function* () {
        const service = yield* UserService
        const store = yield* KeyValueStore.KeyValueStore
        const first = yield* service.ensure(Option.none())
        const size = yield* store.size
        yield* TestClock.adjust('1 minute')

        const second = yield* service.ensure(Option.some(first.secret))

        assertEquals(second.user, first.user)
        assert.strictEqual(Redacted.value(second.secret), Redacted.value(first.secret))
        assert.strictEqual(yield* store.size, size)
      }),
    )

    it.effect('ensure(some(unknown)) creates a new user with a new secret', () =>
      Effect.gen(function* () {
        const service = yield* UserService
        const { user, secret } = yield* service.ensure(Option.some(unknownSecret))

        assert.notStrictEqual(Redacted.value(secret), Redacted.value(unknownSecret))
        assertEquals(yield* service.authenticate(secret), user)
      }),
    )

    it.effect('authenticate of an unknown secret is UserUnknownError', () =>
      Effect.gen(function* () {
        const service = yield* UserService

        const error = yield* Effect.flip(service.authenticate(unknownSecret))

        assertSchemaEquals(UserUnknownError, error, new UserUnknownError())
      }),
    )
  })
})
