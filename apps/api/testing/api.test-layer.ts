import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { ConfigProvider, Effect, Layer, Ref } from 'effect'
import { Cookies, HttpClient } from 'effect/http'

import { QueueClientTest } from '@app-template/application/testing'
import { AttachmentBucketTest, RepositoryStackTest } from '@app-template/domain/testing'
import { ApiClient } from '@app-template/http-api'
import { TransactionTest } from '@app-template/infrastructure/testing'
import { recordQueue } from '@app-template/queue/testing'

import { ApiHttp } from '#api/layer'

/**
 * The api on an ephemeral port over the memory layers: fresh rows, the memory attachment bucket,
 * the identity transaction and a queue that only records. Its `HttpClient` targets that port, and
 * the repositories stay in context for arranging what only the worker writes.
 */
export const ApiServerTest = ApiHttp.pipe(
  Layer.provide([AttachmentBucketTest, TransactionTest, QueueClientTest]),
  Layer.provide(recordQueue().layer),
  Layer.provideMerge(BunHttpServer.layerTest),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide([BunCrypto.layer, ConfigProvider.layer(ConfigProvider.fromUnknown({}))]),
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
