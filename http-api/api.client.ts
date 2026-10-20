import { Context, Layer } from 'effect'
import { FetchHttpClient, type HttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'

import { Api } from '#http-api/api'

export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  '@app-template/http-api/ApiClient',
) {
  static readonly layer = (baseUrl: string): Layer.Layer<ApiClient, never, HttpClient.HttpClient> =>
    Layer.effect(this, HttpApiClient.make(Api, { baseUrl }))

  static readonly layerFetch = (baseUrl: string): Layer.Layer<ApiClient> =>
    this.layer(baseUrl).pipe(Layer.provide(FetchHttpClient.layer))
}
