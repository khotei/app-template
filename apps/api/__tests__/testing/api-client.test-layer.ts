import { Context, Layer } from 'effect'
import type { HttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'

import { Api } from '@app-template/http-api'

/** The api's own client, decoding into the domain's models and errors, for its tests and the e2e. */
export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  '@app-template/apps/api/__tests__/testing/ApiClient',
) {
  static readonly layer = (baseUrl: string): Layer.Layer<ApiClient, never, HttpClient.HttpClient> =>
    Layer.effect(this, HttpApiClient.make(Api, { baseUrl }))
}
