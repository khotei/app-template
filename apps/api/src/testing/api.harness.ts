import { BunHttpServer, BunServices } from '@effect/platform-bun'
import { ConfigProvider, Effect, Layer, Ref } from 'effect'
import { Cookies, HttpClient } from 'effect/http'

import { AttachmentStoreMemory, DbTest } from '@app-template/application/testing'
import { ApiClient } from '@app-template/http-api'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { recordQueue } from '@app-template/queue/testing'

import { ApiHttp } from '#api/layer'

/**
 * The api on an ephemeral port over a fresh database, the memory attachment store and a queue
 * that records what it is sent; its `HttpClient` targets that port, and its `Db` is open for
 * arranging what only the worker writes.
 */
export const ApiServerTest = ApiHttp.pipe(
  Layer.provide([AttachmentRepositoryPg, AttachmentStoreMemory]),
  Layer.provideMerge(BunHttpServer.layerTest),
  Layer.provideMerge(DbTest),
  Layer.provide([
    recordQueue().layer,
    BunServices.layer,
    ConfigProvider.layer(ConfigProvider.fromUnknown({})),
  ]),
)

/**
 * An `ApiClient` with a cookie jar of its own that starts from `cookies`, as a browser's would;
 * the `HttpClient` it puts in context sends through the same jar.
 */
export const layerApiClient = (cookies: Cookies.Cookies = Cookies.empty) =>
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

/** One browser on an api of the test's own: no row, object or server is shared with another test. */
export const ApiTest = layerApiClient().pipe(Layer.provideMerge(ApiServerTest))
