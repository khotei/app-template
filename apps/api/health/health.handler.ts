import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { Api } from '@app-template/http-api'

export const HealthHandler = HttpApiBuilder.group(Api, 'health', (handlers) =>
  handlers.handle('get', () => Effect.succeed({ status: 'ok' as const })),
)
