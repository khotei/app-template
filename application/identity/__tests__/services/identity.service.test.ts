import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Redacted, Result } from 'effect'
import { Base64Url, Hex } from 'effect/encoding'

import { UserId } from '@app-template/application/user'
import type { UserEntityWhere } from '@app-template/kernel/data'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { Identity, IdentityUnknownError, type UserSecret } from '#identity/domain/identity.model'
import { IdentityService } from '#identity/services/identity.service'
import { layerIdentityTest } from '#testing/identity/identity.test-layer'

const storedUser = {
  id: UserId.make('0192d4e0-7b3a-7c00-8000-000000000010'),
  createdAt: DateTime.toDateUtc(epoch),
}

const unknownSecret = Redacted.make('q3Jx0V8m2bZ9yT_4kW-1sN7uP5oA6dLcE0fG8hI2jK4')

/** The hex SHA-256 of a secret by Web Crypto, apart from the service's `Digest`. */
const hashWithWebCrypto = (secret: UserSecret) =>
  Effect.promise(() =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(Redacted.value(secret))),
  ).pipe(Effect.map((digest) => Hex.encode(new Uint8Array(digest))))

describe('IdentityService', () => {
  it.effect(
    'authenticate reads the user by the hex SHA-256 of the secret and answers its identity',
    () => {
      const wheres: Array<UserEntityWhere> = []
      return Effect.gen(function* () {
        const service = yield* IdentityService

        const identity = yield* service.authenticate(unknownSecret)

        const hash = yield* hashWithWebCrypto(unknownSecret)
        assert.deepStrictEqual(wheres, [{ credentials: { kind: 'secret', hash } }])
        assert.deepStrictEqual(identity, new Identity({ userId: storedUser.id }))
      }).pipe(
        Effect.provide(
          layerIdentityTest({
            selectOne: (where) =>
              Effect.sync(() => wheres.push(where)).pipe(Effect.as(Option.some(storedUser))),
          }),
        ),
      )
    },
  )

  it.effect('recognise of a stored user answers its identity and the secret, inserting none', () =>
    Effect.gen(function* () {
      const service = yield* IdentityService

      const { identity, secret } = yield* service.recognise(unknownSecret)

      assert.deepStrictEqual(identity, new Identity({ userId: storedUser.id }))
      assert.strictEqual(Redacted.value(secret), Redacted.value(unknownSecret))
    }).pipe(
      Effect.provide(
        layerIdentityTest({ selectOne: () => Effect.succeed(Option.some(storedUser)) }),
      ),
    ),
  )

  it.effect(
    'recognise of an unknown secret creates a user with a UUIDv7 id at the clock time and answers its identity and a new secret, storing only its hex SHA-256',
    () => {
      const writes: Array<readonly [string, unknown]> = []
      return Effect.gen(function* () {
        const service = yield* IdentityService

        const { identity, secret } = yield* service.recognise(unknownSecret)

        const hash = yield* hashWithWebCrypto(secret)
        assert.instanceOf(identity, Identity)
        assert.isTrue(isUuidV7(identity.userId))
        assert.notStrictEqual(Redacted.value(secret), Redacted.value(unknownSecret))
        assert.deepStrictEqual(
          Result.map(Base64Url.decode(Redacted.value(secret)), (bytes) => bytes.length),
          Result.succeed(32),
        )
        assert.deepStrictEqual(writes, [
          ['insert', { id: identity.userId, createdAt: DateTime.toDateUtc(epoch) }],
          ['insertCredential', { kind: 'secret', hash, userId: identity.userId }],
        ])
      }).pipe(
        Effect.provide(
          layerIdentityTest({
            selectOne: () => Effect.succeed(Option.none()),
            insert: (row) => Effect.sync(() => void writes.push(['insert', row])),
            insertCredential: (row) =>
              Effect.sync(() => void writes.push(['insertCredential', row])),
          }),
        ),
      )
    },
  )

  it.effect('authenticate of an unknown secret is IdentityUnknownError', () =>
    Effect.gen(function* () {
      const service = yield* IdentityService

      const error = yield* service.authenticate(unknownSecret).pipe(Effect.flip)

      assertSchemaEquals(IdentityUnknownError, error, new IdentityUnknownError())
    }).pipe(Effect.provide(layerIdentityTest({ selectOne: () => Effect.succeed(Option.none()) }))),
  )
})
