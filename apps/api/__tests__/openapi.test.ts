import { it } from '@effect/vitest'
import { Formatter } from 'effect'
import { OpenApi } from 'effect/http-api'

import { Api } from '#api/api'

// The file-snapshot matcher exists only on vitest's `expect`, taken from the test's context.
it('the contract matches its OpenAPI snapshot', ({ expect }) =>
  expect(
    `${Formatter.formatJson(OpenApi.fromApi(Api), { space: 2 })}\n`,
    'A wire change on purpose: run make api-snapshot and commit the snapshot with it',
  ).toMatchFileSnapshot('../openapi.json'))
