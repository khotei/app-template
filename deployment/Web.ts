import * as path from 'node:path'

import * as Command from 'alchemy/Command'
import { Effect } from 'effect'

import Api from '#deployment/Api'

/**
 * The web. In dev its own server runs, and its `/api/*` proxy is pointed at the api's Function
 * URL: floci's CloudFront refuses a Function URL as an origin, so no `Router` stands before it.
 */
export const Web = Effect.gen(function* () {
  const api = yield* Api

  return yield* Command.Dev('Web', {
    command: 'bun --hot main.ts',
    cwd: path.join(import.meta.dirname, '../apps/web'),
    env: { API_ORIGIN: api.functionUrl },
  })
})
