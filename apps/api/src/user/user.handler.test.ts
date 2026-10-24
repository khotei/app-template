import { assert, describe } from '@effect/vitest'
import { Duration, Effect, Option } from 'effect'
import { Cookies } from 'effect/http'

import { apiSuite, readUserSecretCookie, withApi } from '#api/testing/api.harness'

const issuedCookie: Cookies.Cookie['options'] = {
  maxAge: Duration.seconds(31_536_000),
  httpOnly: true,
  sameSite: 'lax',
}

describe('users', () => {
  apiSuite((it) => {
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
      withApi((api, _http, browse) =>
        Effect.gen(function* () {
          const existing = yield* api.users.ensure()

          const [user, response] = yield* browse(
            (forger) => forger.users.ensure({ responseMode: 'decoded-and-response' }),
            Cookies.fromSetCookie('user_secret=forged'),
          )

          assert.notStrictEqual(user.id, existing.id)
          assert.notStrictEqual(Option.getOrThrow(readUserSecretCookie(response)).value, 'forged')
        }),
      ),
    )
  })
})
