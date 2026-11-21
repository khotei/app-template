import { Context, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'

import { Api } from '#web/shared/api.generated'

export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  '@app-template/apps/web/shared/ApiClient',
) {
  /** Calls the api through the web server's `/api` proxy, so the browser stays same-origin. */
  static readonly layer = Layer.effect(
    this,
    HttpApiClient.make(Api, { baseUrl: new URL('/api', window.location.origin).href }),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}
