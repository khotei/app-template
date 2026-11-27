import { assert, describe, it } from '@effect/vitest'
import { Duration, Effect, Option } from 'effect'
import { Cookies, type HttpClientResponse } from 'effect/http'

import { owner } from '@app-template/application/chat/testing'
import { IdentityUnknownError } from '@app-template/application/identity'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ApiClient, layerApiTest, ownerCookie, signedIn } from '#testing/api.test-layer'

const issuedCookie: Cookies.Cookie['options'] = {
  maxAge: Duration.seconds(31_536_000),
  httpOnly: true,
  sameSite: 'lax',
}

const readUserSecretCookie = (response: HttpClientResponse.HttpClientResponse) =>
  Cookies.get(response.cookies, 'user_secret')

/** A `UserRepository` that finds no user and takes every new one. */
const newcomer = {
  selectOne: () => Effect.succeedNone,
  insert: () => Effect.void,
  insertCredential: () => Effect.void,
}

describe('identity', () => {
  it.effect('POST /identity is 201 with an HttpOnly, Lax, one-year cookie and no Secure', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const [, response] = yield* api.identity.recognise({ responseMode: 'decoded-and-response' })

      const cookie = readUserSecretCookie(response).pipe(Option.getOrThrow)
      assert.strictEqual(response.status, 201)
      assert.match(cookie.value, /^[\w-]{43}$/)
      assert.deepStrictEqual(cookie.options, issuedCookie)
    }).pipe(Effect.provide(layerApiTest({ users: newcomer }))),
  )

  it.effect(
    'POST /identity with the cookie of a known user returns their identity and refreshes the cookie',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient

        const [, response] = yield* api.identity.recognise({ responseMode: 'decoded-and-response' })

        const cookie = readUserSecretCookie(response).pipe(Option.getOrThrow)
        assert.strictEqual(yield* response.text, `{"userId":"${owner}"}`)
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

      const [, response] = yield* forger.identity.recognise({
        responseMode: 'decoded-and-response',
      })

      assert.notStrictEqual(readUserSecretCookie(response).pipe(Option.getOrThrow).value, 'forged')
    }).pipe(
      Effect.provide(
        layerApiTest({ users: newcomer }, Cookies.fromSetCookie('user_secret=forged')),
      ),
    ),
  )

  it.effect(
    'GET /identity with the cookie of a known user is 200 with their identity, setting no cookie',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient

        const [, response] = yield* api.identity.get({ responseMode: 'decoded-and-response' })

        assert.strictEqual(response.status, 200)
        assert.strictEqual(yield* response.text, `{"userId":"${owner}"}`)
        assert.isTrue(readUserSecretCookie(response).pipe(Option.isNone))
      }).pipe(Effect.provide(layerApiTest({ users: signedIn }, ownerCookie))),
  )

  it.effect.each([
    { name: 'a forged cookie', cookies: Cookies.fromSetCookie('user_secret=forged') },
    { name: 'no cookie', cookies: Cookies.empty },
  ])('GET /identity with $name is 401 IdentityUnknownError and stores no user', ({ cookies }) => {
    const inserts: Array<unknown> = []
    return Effect.gen(function* () {
      const api = yield* ApiClient

      const error = yield* api.identity.get().pipe(Effect.flip)

      assertSchemaEquals(IdentityUnknownError, error, new IdentityUnknownError())
      assert.deepStrictEqual(inserts, [])
    }).pipe(
      Effect.provide(
        layerApiTest(
          {
            users: {
              selectOne: () => Effect.succeedNone,
              insert: (row) => Effect.sync(() => void inserts.push(row)),
            },
          },
          cookies,
        ),
      ),
    )
  })
})
