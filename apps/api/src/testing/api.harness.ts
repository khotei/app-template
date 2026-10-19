import { BunHttpServer, BunServices } from '@effect/platform-bun'
import { Array as Arr, ConfigProvider, Effect, Layer, Option, Record as Rec, Ref } from 'effect'
import { Cookies, HttpClient, type HttpClientResponse } from 'effect/http'
import { OpenApi } from 'effect/http-api'
import { KeyValueStore } from 'effect/persistence'

import { Api, ApiClient } from '@app-template/http-api'

import { ApiHttp } from '#api/layer'

/** The api on an ephemeral port over the memory store; its `HttpClient` targets that port. */
export const makeApiHarness = () =>
  ApiHttp.pipe(
    Layer.provideMerge(BunHttpServer.layerTest),
    Layer.provide([
      KeyValueStore.layerMemory,
      BunServices.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({})),
    ]),
  )

const apiClientWithJar = (cookies: Cookies.Cookies) =>
  ApiClient.layer('').pipe(
    Layer.provide(
      Layer.effect(
        HttpClient.HttpClient,
        Effect.map(Effect.zip(HttpClient.HttpClient, Ref.make(cookies)), ([client, jar]) =>
          HttpClient.withCookiesRef(client, jar),
        ),
      ),
    ),
  )

/** Runs `body` with an `ApiClient` whose cookie jar starts from `cookies`, as a browser's would. */
export const withApi = <A, E, R>(
  body: (api: ApiClient['Service']) => Effect.Effect<A, E, R>,
  cookies: Cookies.Cookies = Cookies.empty,
) => Effect.flatMap(ApiClient, body).pipe(Effect.provide(apiClientWithJar(cookies)))

export const readUserSecretCookie = (response: HttpClientResponse.HttpClientResponse) =>
  Cookies.get(response.cookies, 'user_secret')

export const spec = OpenApi.fromApi(Api)

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

export const operations = Arr.flatMap(Rec.toEntries(spec.paths), ([path, item]) =>
  Arr.getSomes(
    Arr.map(methods, (method) =>
      Option.map(Option.fromNullishOr(item[method]), (operation) => ({ method, path, operation })),
    ),
  ),
)
