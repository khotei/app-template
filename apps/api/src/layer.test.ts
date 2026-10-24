import { assert, describe, it, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { HttpClient } from 'effect/http'

import { AwsClientsMiniStack } from '@app-template/testing'

import { operations, spec, withOwnApi } from '#api/testing/api.harness'

describe('api routes', () => {
  layer(AwsClientsMiniStack, { timeout: '60 seconds' })((it) => {
    it.effect('GET /openapi.json serves the spec derived from Api', () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get('/openapi.json')

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(yield* response.json, JSON.parse(JSON.stringify(spec)))
      }).pipe(withOwnApi),
    )

    it.effect('GET /docs serves the Scalar page', () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get('/docs')

        assert.strictEqual(response.status, 200)
        assert.match(response.headers['content-type'] ?? '', /^text\/html/)
        assert.include(yield* response.text, 'scalar')
      }).pipe(withOwnApi),
    )
  })

  // An endpoint may list its own errors at 400 too; the spec then joins them in one `anyOf`.
  it.effect.each(operations)(
    'the spec documents 400 RequestInvalidError on $method $path',
    ({ operation }) =>
      Effect.sync(() => {
        const response = operation.responses['400']
        const schema = response?.content?.['application/json']?.schema

        assert.include(response?.description.split(' | ') ?? [], 'RequestInvalidError')
        assert.deepInclude(schema?.anyOf ?? [schema], {
          $ref: '#/components/schemas/RequestInvalidErrorEncoded',
        })
      }),
  )
})
