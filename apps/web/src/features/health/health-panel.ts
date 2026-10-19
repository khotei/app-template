import { Effect } from 'effect'

import { ApiClient } from '@app-template/http-api'
import { joinClassNames } from '@app-template/ui'

const getHealth = ApiClient.use((api) => api.health.get())

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
  panel.className = joinClassNames('health', view.modifier)
  panel.textContent = view.text
})
