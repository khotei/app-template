import { Array as Arr, Formatter, Option, pipe } from 'effect'
import { OpenApi } from 'effect/http-api'

import { Api } from '@app-template/http-api'

const path = pipe(
  Bun.argv,
  Arr.get(2),
  Option.getOrThrowWith(() => new Error('usage: bun apps/api/openapi.ts <output file>')),
)

await Bun.write(path, `${Formatter.formatJson(OpenApi.fromApi(Api), { space: 2 })}\n`)
