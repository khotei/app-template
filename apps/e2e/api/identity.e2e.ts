import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

import { ApiClient, StrangerApiClient } from '@app-template/api/testing'
import { IdentityUnknownError } from '@app-template/application/identity'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { StandTest } from '#testing/stand.test-layer'

describe('identity, through the api', () => {
  it.live('get answers the identity recognise gave, and a browser with no cookie 401', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const stranger = yield* StrangerApiClient

      const recognised = yield* api.identity.recognise()
      const answered = yield* api.identity.get()
      const refused = yield* stranger.identity.get().pipe(Effect.flip)

      assert.strictEqual(answered.userId, recognised.userId)
      assertSchemaEquals(IdentityUnknownError, refused, new IdentityUnknownError())
    }).pipe(Effect.provide(StandTest)),
  )
})

// The case alters the schema to make Postgres refuse a write, so it takes a stand of its own.
describe('a write Postgres refuses, through the api', () => {
  it.live('a recognise whose credential is refused stores no user', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const client = yield* SqlClient.SqlClient
      // The credential is the last write of a new user's recognise, after the user.
      yield* client
        .unsafe(`ALTER TABLE credentials ADD CONSTRAINT refuse_credential CHECK (kind <> 'secret')`)
        .pipe(Effect.orDie)

      const status = yield* api.identity.recognise().pipe(
        Effect.as(201),
        Effect.catchTag('HttpClientError', (error) => Effect.succeed(error.response?.status)),
      )

      // The api responds to a defect, such as a write Postgres refuses, with a bare `500`.
      assert.strictEqual(status, 500)
      assert.deepStrictEqual(yield* client`select id from users`, [])
    }).pipe(Effect.provide(StandTest)),
  )
})
