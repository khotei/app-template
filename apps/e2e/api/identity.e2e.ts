import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

import { ApiClient } from '@app-template/api/testing'

import { StandTest } from '#testing/stand.test-layer'

describe('identity, through the api', () => {
  it.live('get answers the identity recognise gave', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const recognised = yield* api.identity.recognise()
      const answered = yield* api.identity.get()

      assert.strictEqual(answered.userId, recognised.userId)
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
