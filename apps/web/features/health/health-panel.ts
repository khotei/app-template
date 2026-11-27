import { Effect } from 'effect'

import { ClassName } from '@app-template/packages/ui'

import { ApiClient } from '#web/shared/api.client'

const getHealth = Effect.gen(function* () {
  const api = yield* ApiClient
  return yield* api.health.healthGet()
})

const failureMessages = {
  RequestInvalidError: 'API status unknown: the api refused the health check.',
  HttpClientError: 'API unavailable: it could not be reached or answered with an error.',
  SchemaError: 'API status unknown: the api answered in an unexpected shape.',
} as const satisfies Record<Effect.Error<typeof getHealth>['_tag'], string>

export const renderHealthPanel = Effect.fn('renderHealthPanel')(function* (root: HTMLElement) {
  const panel = document.createElement('p')
  root.replaceChildren(panel)
  const view = yield* getHealth.pipe(
    Effect.match({
      onSuccess: (health) => ({ modifier: 'health--ok', text: `API status: ${health.status}` }),
      onFailure: (error) => ({ modifier: 'health--down', text: failureMessages[error._tag] }),
    }),
  )
  panel.className = ClassName.join('health', view.modifier)
  panel.textContent = view.text
})
