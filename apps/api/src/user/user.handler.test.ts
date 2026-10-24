import { assert } from '@effect/vitest'
import { Duration, Effect, Layer, Option } from 'effect'
import { Cookies, type HttpClientResponse } from 'effect/http'

import { ApiClient } from '@app-template/http-api'
import { describeOnMiniStack } from '@app-template/testing'

import { ApiServerTest, ApiTest, layerApiClient } from '#api/testing/api.harness'

const issuedCookie: Cookies.Cookie['options'] = {
  maxAge: Duration.seconds(31_536_000),
  httpOnly: true,
  sameSite: 'lax',
}

const readUserSecretCookie = (response: HttpClientResponse.HttpClientResponse) =>
  Cookies.get(response.cookies, 'user_secret')

describeOnMiniStack('users', (it) => {
  it.effect('POST /users is 201 with an HttpOnly, Lax, one-year cookie and no Secure', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const [, response] = yield* api.users.ensure({ responseMode: 'decoded-and-response' })

      const cookie = Option.getOrThrow(readUserSecretCookie(response))
      assert.strictEqual(response.status, 201)
      assert.match(cookie.value, /^[\w-]{43}$/)
      assert.deepStrictEqual(cookie.options, issuedCookie)
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'a second POST /users with the cookie returns the same user and refreshes the cookie',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const [first, issued] = yield* api.users.ensure({ responseMode: 'decoded-and-response' })

        const [second, refreshed] = yield* api.users.ensure({
          responseMode: 'decoded-and-response',
        })

        const cookie = Option.getOrThrow(readUserSecretCookie(refreshed))
        assert.strictEqual(second.id, first.id)
        assert.strictEqual(cookie.value, Option.getOrThrow(readUserSecretCookie(issued)).value)
        assert.deepStrictEqual(cookie.options, issuedCookie)
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect('a forged cookie gets a new secret', () =>
    Effect.gen(function* () {
      const forger = yield* ApiClient

      const [, response] = yield* forger.users.ensure({ responseMode: 'decoded-and-response' })

      assert.notStrictEqual(Option.getOrThrow(readUserSecretCookie(response)).value, 'forged')
    }).pipe(
      Effect.provide(
        layerApiClient(Cookies.fromSetCookie('user_secret=forged')).pipe(
          Layer.provide(ApiServerTest),
        ),
      ),
    ),
  )
})
