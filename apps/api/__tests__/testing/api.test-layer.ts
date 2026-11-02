import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { ConfigProvider, Layer } from 'effect'
import { Cookies } from 'effect/http'

import { CurrentReplyProvenanceTest } from '@app-template/chat/testing'
import { ApiClient } from '@app-template/http-api'
import { RepositoryStackTest } from '@app-template/kernel/data/testing'
import { TransactionTest } from '@app-template/packages/db/testing'
import { recordQueue } from '@app-template/packages/queue/testing'
import { layerCookieJarTest } from '@app-template/packages/testing'

import { ApiHttp } from '#api/layer'

/** The whole api process, clients and all, for the e2e journey that runs it beside the worker. */
export { ApiLayer as ApiLayerTest } from '#api/layer'

/**
 * The api on an ephemeral port over the memory layers: fresh rows and files,
 * the identity transaction, a queue that only records and a fixed reply provenance. Its `HttpClient` targets that port, and
 * the repositories stay in context for arranging what only the worker writes.
 */
export const ApiServerTest = ApiHttp.pipe(
  Layer.provide([TransactionTest, recordQueue().layer, CurrentReplyProvenanceTest]),
  Layer.provideMerge(BunHttpServer.layerTest),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide([BunCrypto.layer, ConfigProvider.layer(ConfigProvider.fromUnknown({}))]),
)

/**
 * An `ApiClient` with a cookie jar of its own that starts from `cookies`, as a browser's would;
 * the `HttpClient` it puts in context sends through the same jar.
 */
export const layerApiClient = (cookies: Cookies.Cookies = Cookies.empty) =>
  ApiClient.layer('').pipe(Layer.provideMerge(layerCookieJarTest(cookies)))

/** One browser on an api of the test's own: no row, object or server is shared with another test. */
export const ApiTest = layerApiClient().pipe(Layer.provideMerge(ApiServerTest))
