import { assert } from '@effect/vitest'
import { Effect } from 'effect'

import { describeOnMiniStack } from '@app-template/testing'

import { operations, spec, withApi } from '#api/testing/api.harness'

describeOnMiniStack('api routes', (it) => {
  it.effect('GET /openapi.json serves the spec derived from Api', () =>
    withApi((_, { http }) =>
      Effect.gen(function* () {
        const response = yield* http.get('/openapi.json')

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(yield* response.json, JSON.parse(JSON.stringify(spec)))
      }),
    ),
  )

  it.effect('GET /docs serves the Scalar page', () =>
    withApi((_, { http }) =>
      Effect.gen(function* () {
        const response = yield* http.get('/docs')

        assert.strictEqual(response.status, 200)
        assert.match(response.headers['content-type'] ?? '', /^text\/html/)
        assert.include(yield* response.text, 'scalar')
      }),
    ),
  )

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
