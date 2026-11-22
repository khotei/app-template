import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { Clock, ConfigProvider, Context, DateTime, Effect, Layer, Option, Ref } from 'effect'
import { Cookies, HttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'

import { owner } from '@app-template/application/chat/testing'
import {
  ChatRepository,
  MessageRepository,
  RunRepository,
  UserRepository,
} from '@app-template/kernel/data'
import { TransactionTest } from '@app-template/packages/db/testing'
import { recordMessages } from '@app-template/packages/queue/testing'
import { epoch } from '@app-template/packages/testing'

import { Api } from '#api/api'
import { ApiHttp } from '#api/layer'

/** The whole api process, clients and all, for the e2e journey that runs it beside the worker. */
export { ApiLayer } from '#api/layer'

/** The api's own client, decoding into the domain's models and errors, for its tests and the e2e. */
export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  '@app-template/apps/api/__tests__/testing/ApiClient',
) {
  static readonly layer = (baseUrl: string): Layer.Layer<ApiClient, never, HttpClient.HttpClient> =>
    Layer.effect(this, HttpApiClient.make(Api, { baseUrl }))
}

/** The host `BunHttpServer.layerTest` serves on; a cookie is scoped to a host, whatever its TCP port. */
const testServerUrl = 'http://127.0.0.1'

/**
 * An `ApiClient` on `baseUrl` with a cookie jar of its own that starts from `cookies`, set by the
 * test server's host, as a browser's would, over the `HttpClient` in context; the `HttpClient` it
 * puts in context sends through the same jar.
 */
export const layerApiClient = (baseUrl = '', cookies = Cookies.empty) =>
  ApiClient.layer(baseUrl).pipe(
    Layer.provideMerge(
      Layer.effect(
        HttpClient.HttpClient,
        Clock.currentTimeMillis.pipe(
          Effect.map((now) => Cookies.mergeIntoArray([], testServerUrl, cookies, now)),
          Effect.flatMap(Ref.make),
          Effect.flatMap((jar) => HttpClient.HttpClient.useSync(HttpClient.withCookiesRef(jar))),
        ),
      ),
    ),
  )

/** What each repository returns in a case, as `Layer.mock` takes it; a method left out dies. */
export interface ApiRepositoryMocks {
  readonly users?: Layer.PartialEffectful<UserRepository['Service']>
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
  readonly runs?: Layer.PartialEffectful<RunRepository['Service']>
}

/**
 * The api on an ephemeral TCP port over `mocks`, the identity transaction and a queue that only
 * records. Its `HttpClient` targets that TCP port.
 *
 * A real server, not `HttpApiTest`: its client takes no cookie jar, and a defect is no response
 * there.
 */
export const layerApiServerTest = ({
  users = {},
  chats = {},
  messages = {},
  runs = {},
}: ApiRepositoryMocks = {}) =>
  ApiHttp.pipe(
    Layer.provide([
      TransactionTest,
      recordMessages().layer,
      Layer.mock(UserRepository, users),
      Layer.mock(ChatRepository, chats),
      Layer.mock(MessageRepository, messages),
      Layer.mock(RunRepository, runs),
    ]),
    Layer.provideMerge(BunHttpServer.layerTest),
    Layer.provide([BunCrypto.layer, ConfigProvider.layer(ConfigProvider.fromUnknown({}))]),
  )

/** The cookie of a browser that signed in before, as `owner`, whom `signedIn` finds. */
export const ownerCookie = Cookies.fromSetCookie(
  'user_secret=q3Jx0V8m2bZ9yT_4kW-1sN7uP5oA6dLcE0fG8hI2jK4',
)

/** A `UserRepository` that finds `owner` by any credential. */
export const signedIn = {
  selectOne: () => Effect.succeed(Option.some({ id: owner, createdAt: DateTime.toDateUtc(epoch) })),
} satisfies ApiRepositoryMocks['users']

/** One browser, starting from `cookies`, on an api of the test's own over `mocks`. */
export const layerApiTest = (mocks: ApiRepositoryMocks = {}, cookies = Cookies.empty) =>
  layerApiClient('', cookies).pipe(Layer.provideMerge(layerApiServerTest(mocks)))
