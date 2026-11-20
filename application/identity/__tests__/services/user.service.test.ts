import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option, Redacted, Result } from 'effect'
import { Base64Url, Hex } from 'effect/encoding'

import { type UserEntityWhere, UserRepository } from '@app-template/kernel/data'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { UserId } from '#identity/contract/user.id'
import { UserUnknownError } from '#identity/domain/user.error'
import type { UserSecret } from '#identity/domain/user.model'
import { UserService } from '#identity/services/user.service'

type Insert = Parameters<UserRepository['Service']['insert']>

/** The service over `repository`, a `Layer.mock` of the methods the case lets it call. */
const userServiceOver = (repository: Layer.Layer<UserRepository>) =>
  UserService.layer.pipe(Layer.provide([repository, BunCrypto.layer]))

const storedUser = {
  id: UserId.make('0192d4e0-7b3a-7c00-8000-000000000010'),
  createdAt: DateTime.toDateUtc(epoch),
}

const unknownSecret = Redacted.make('q3Jx0V8m2bZ9yT_4kW-1sN7uP5oA6dLcE0fG8hI2jK4')

/** The hex SHA-256 of a secret by Web Crypto, apart from the service's `Crypto`. */
const hashWithWebCrypto = (secret: UserSecret) =>
  Effect.promise(() =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(Redacted.value(secret))),
  ).pipe(Effect.map((digest) => Hex.encode(new Uint8Array(digest))))

describe('UserService', () => {
  it.effect('authenticate reads the user by the hex SHA-256 of the secret', () => {
    const wheres: Array<UserEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* UserService

      const user = yield* service.authenticate(unknownSecret)

      const hash = yield* hashWithWebCrypto(unknownSecret)
      assert.deepStrictEqual(wheres, [{ credential: { kind: 'secret', hash } }])
      assert.strictEqual(user.id, storedUser.id)
    }).pipe(
      Effect.provide(
        userServiceOver(
          Layer.mock(UserRepository, {
            selectOne: (where) =>
              Effect.sync(() => wheres.push(where)).pipe(Effect.as(Option.some(storedUser))),
          }),
        ),
      ),
    )
  })

  it.effect('ensure of a stored user returns it and the secret, inserting none', () =>
    Effect.gen(function* () {
      const service = yield* UserService

      const { user, secret } = yield* service.ensure(unknownSecret)

      assert.strictEqual(user.id, storedUser.id)
      assert.strictEqual(Redacted.value(secret), Redacted.value(unknownSecret))
    }).pipe(
      Effect.provide(
        userServiceOver(
          Layer.mock(UserRepository, { selectOne: () => Effect.succeed(Option.some(storedUser)) }),
        ),
      ),
    ),
  )

  it.effect(
    'ensure of an unknown secret creates a user with a UUIDv7 id at the clock time and a new secret, storing only its hex SHA-256',
    () => {
      const inserts: Array<Insert> = []
      return Effect.gen(function* () {
        const service = yield* UserService

        const { user, secret } = yield* service.ensure(unknownSecret)

        const hash = yield* hashWithWebCrypto(secret)
        assert.isTrue(isUuidV7(user.id))
        assertEquals(user.createdAt, epoch)
        assert.notStrictEqual(Redacted.value(secret), Redacted.value(unknownSecret))
        assert.deepStrictEqual(
          Result.map(Base64Url.decode(Redacted.value(secret)), (bytes) => bytes.length),
          Result.succeed(32),
        )
        assert.deepStrictEqual(inserts, [
          [
            { id: user.id, createdAt: DateTime.toDateUtc(epoch) },
            { kind: 'secret', hash },
          ],
        ])
      }).pipe(
        Effect.provide(
          userServiceOver(
            Layer.mock(UserRepository, {
              selectOne: () => Effect.succeed(Option.none()),
              insert: (...insert) =>
                Effect.sync(() => {
                  inserts.push(insert)
                }),
            }),
          ),
        ),
      )
    },
  )

  it.effect('authenticate of an unknown secret is UserUnknownError', () =>
    Effect.gen(function* () {
      const service = yield* UserService

      const error = yield* service.authenticate(unknownSecret).pipe(Effect.flip)

      assertSchemaEquals(UserUnknownError, error, new UserUnknownError())
    }).pipe(
      Effect.provide(
        userServiceOver(
          Layer.mock(UserRepository, { selectOne: () => Effect.succeed(Option.none()) }),
        ),
      ),
    ),
  )
})
