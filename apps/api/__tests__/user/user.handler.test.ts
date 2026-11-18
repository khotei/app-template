import { assert, describe, it } from '@effect/vitest'
import { Duration, Effect, Option } from 'effect'
import { Cookies, type HttpClientResponse } from 'effect/http'

import { owner } from '@app-template/application/chat/testing'
import { ApiClient } from '@app-template/http-api'

import { layerApiTest, ownerCookie, signedIn } from '#testing/api.test-layer'

const issuedCookie: Cookies.Cookie['options'] = {
  maxAge: Duration.seconds(31_536_000),
  httpOnly: true,
  sameSite: 'lax',
}

const readUserSecretCookie = (response: HttpClientResponse.HttpClientResponse) =>
  Cookies.get(response.cookies, 'user_secret')

/** A `UserRepository` that finds no user and takes every new one. */
const newcomer = { selectOne: () => Effect.succeedNone, insert: () => Effect.void }

describe('users', () => {
  it.effect('POST /users is 201 with an HttpOnly, Lax, one-year cookie and no Secure', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const [, response] = yield* api.users.ensure({ responseMode: 'decoded-and-response' })

      const cookie = readUserSecretCookie(response).pipe(Option.getOrThrow)
      assert.strictEqual(response.status, 201)
      assert.match(cookie.value, /^[\w-]{43}$/)
      assert.deepStrictEqual(cookie.options, issuedCookie)
    }).pipe(Effect.provide(layerApiTest({ users: newcomer }))),
  )

  it.effect(
    'POST /users with the cookie of a known user returns them and refreshes the cookie',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient

        const [user, response] = yield* api.users.ensure({ responseMode: 'decoded-and-response' })

        const cookie = readUserSecretCookie(response).pipe(Option.getOrThrow)
        assert.strictEqual(user.id, owner)
        assert.strictEqual(
          cookie.value,
          Cookies.get(ownerCookie, 'user_secret').pipe(Option.getOrThrow).value,
        )
        assert.deepStrictEqual(cookie.options, issuedCookie)
      }).pipe(Effect.provide(layerApiTest({ users: signedIn }, ownerCookie))),
  )

  it.effect('a forged cookie gets a new secret', () =>
    Effect.gen(function* () {
      const forger = yield* ApiClient

      const [, response] = yield* forger.users.ensure({ responseMode: 'decoded-and-response' })

      assert.notStrictEqual(readUserSecretCookie(response).pipe(Option.getOrThrow).value, 'forged')
    }).pipe(
      Effect.provide(
        layerApiTest({ users: newcomer }, Cookies.fromSetCookie('user_secret=forged')),
      ),
    ),
  )
})
