import { BunHttpServer } from '@effect/platform-bun'
import { assert, describe, it, layer } from '@effect/vitest'
import { assertTrue } from '@effect/vitest/utils'
import { Effect } from 'effect'
import { HttpClient, HttpServer } from 'effect/http'

import { ApiClient } from '@app-template/http-api'

import { makeApiHarness, operations, spec } from '#api/testing/api.harness'

const stoppedServerUrl = HttpServer.addressFormattedWith(Effect.succeed).pipe(
  Effect.provide(BunHttpServer.layerServer({ hostname: '127.0.0.1', port: 0 })),
)

describe('api routes', () => {
  layer(makeApiHarness())((it) => {
    it.effect('GET /openapi.json serves the spec derived from Api', () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get('/openapi.json')

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(yield* response.json, JSON.parse(JSON.stringify(spec)))
      }),
    )

    it.effect('GET /docs serves the Scalar page', () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get('/docs')

        assert.strictEqual(response.status, 200)
        assert.match(response.headers['content-type'] ?? '', /^text\/html/)
        assert.include(yield* response.text, 'scalar')
      }),
    )
  })

  it.effect.each(operations)(
    'the spec documents 400 RequestInvalidError on $method $path',
    ({ operation }) =>
      Effect.sync(() =>
        assert.deepStrictEqual(operation.responses['400'], {
          description: 'RequestInvalidError',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RequestInvalidErrorEncoded' },
            },
          },
        }),
      ),
  )

  it.effect('a stopped server fails ApiClient with an HttpClientError', () =>
    Effect.gen(function* () {
      const url = yield* stoppedServerUrl

      const error = yield* Effect.flip(
        Effect.flatMap(ApiClient, (api) => api.health.get()).pipe(
          Effect.provide(ApiClient.layerFetch(url)),
        ),
      )

      assertTrue(error._tag === 'HttpClientError')
      assert.strictEqual(error.reason._tag, 'TransportError')
    }),
  )
})
