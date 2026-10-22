import { assert, describe, it, layer } from '@effect/vitest'
import { Duration, Effect, Option } from 'effect'
import { Cookies } from 'effect/http'

import { User } from '@app-template/domain/user'
import { isUuidV7 } from '@app-template/testing'

import { makeApiHarness, readUserSecretCookie, spec, withApi } from '#api/testing/api.harness'

const issuedCookie: Cookies.Cookie['options'] = {
  maxAge: Duration.seconds(31_536_000),
  httpOnly: true,
  sameSite: 'lax',
}

describe('users', () => {
  layer(makeApiHarness(), { timeout: '60 seconds' })((it) => {
    it.effect('POST /users is 201 with an HttpOnly, Lax, one-year cookie and no Secure', () =>
      withApi((api) =>
        Effect.gen(function* () {
          const [, response] = yield* api.users.ensure({ responseMode: 'decoded-and-response' })
          const cookie = Option.getOrThrow(readUserSecretCookie(response))

          assert.strictEqual(response.status, 201)
          assert.match(cookie.value, /^[\w-]{43}$/)
          assert.deepStrictEqual(cookie.options, issuedCookie)
        }),
      ),
    )

    it.effect('ensure decodes the domain User with a UUIDv7 id', () =>
      withApi((api) =>
        Effect.gen(function* () {
          const user = yield* api.users.ensure()

          assert.instanceOf(user, User)
          assert.isTrue(isUuidV7(user.id))
        }),
      ),
    )

    it.effect(
      'a second POST /users with the cookie returns the same user and refreshes the cookie',
      () =>
        withApi((api) =>
          Effect.gen(function* () {
            const [first, issued] = yield* api.users.ensure({
              responseMode: 'decoded-and-response',
            })
            const [second, refreshed] = yield* api.users.ensure({
              responseMode: 'decoded-and-response',
            })

            const cookie = Option.getOrThrow(readUserSecretCookie(refreshed))

            assert.strictEqual(second.id, first.id)
            assert.strictEqual(cookie.value, Option.getOrThrow(readUserSecretCookie(issued)).value)
            assert.deepStrictEqual(cookie.options, issuedCookie)
          }),
        ),
    )

    it.effect('a forged cookie gets a new user and a new secret', () =>
      Effect.gen(function* () {
        const existing = yield* withApi((api) => api.users.ensure())

        const [user, response] = yield* withApi(
          (api) => api.users.ensure({ responseMode: 'decoded-and-response' }),
          Cookies.fromSetCookie('user_secret=forged'),
        )

        assert.isTrue(isUuidV7(user.id))
        assert.notStrictEqual(user.id, existing.id)
        assert.notStrictEqual(Option.getOrThrow(readUserSecretCookie(response)).value, 'forged')
      }),
    )
  })

  it.effect('POST /users asks for no credential', () =>
    Effect.sync(() => assert.deepStrictEqual(spec.paths['/users']?.post?.security, [])),
  )
})
