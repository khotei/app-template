import { BunHttpServer, BunServices } from '@effect/platform-bun'
import { Array as Arr, ConfigProvider, Effect, Layer, Option, Record as Rec, Ref } from 'effect'
import { Cookies, HttpClient, type HttpClientResponse } from 'effect/http'
import { OpenApi } from 'effect/http-api'
import { KeyValueStore } from 'effect/persistence'

import { Api, ApiClient } from '@app-template/http-api'
import { QueueClient } from '@app-template/queue'

import { ApiHttp } from '#api/layer'

/**
 * The api on an ephemeral port over the memory store and the memory queue; its `HttpClient`
 * targets that port, and its `KeyValueStore` is open for arranging what only the worker writes.
 */
export const makeApiHarness = () =>
  ApiHttp.pipe(
    Layer.provideMerge(BunHttpServer.layerTest),
    Layer.provideMerge(KeyValueStore.layerMemory),
    Layer.provide([
      QueueClient.layerMemory,
      BunServices.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({})),
    ]),
  )

const apiClientWithJar = (cookies: Cookies.Cookies) =>
  ApiClient.layer('').pipe(
    Layer.provideMerge(
      Layer.effect(
        HttpClient.HttpClient,
        Effect.map(Effect.zip(HttpClient.HttpClient, Ref.make(cookies)), ([client, jar]) =>
          HttpClient.withCookiesRef(client, jar),
        ),
      ),
    ),
  )

/**
 * Runs `body` with an `ApiClient` whose cookie jar starts from `cookies`, as a browser's would,
 * and a raw `HttpClient` on the same jar, for the requests and bodies the client cannot express.
 */
export const withApi = <A, E, R>(
  body: (api: ApiClient['Service'], http: HttpClient.HttpClient) => Effect.Effect<A, E, R>,
  cookies: Cookies.Cookies = Cookies.empty,
) =>
  Effect.flatMap(Effect.zip(ApiClient, HttpClient.HttpClient), ([api, http]) =>
    body(api, http),
  ).pipe(Effect.provide(apiClientWithJar(cookies)))

/** Registers the jar's user and opens an empty chat of theirs. */
export const openChat = (api: ApiClient['Service']) =>
  Effect.andThen(api.users.ensure(), api.chats.create())

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
