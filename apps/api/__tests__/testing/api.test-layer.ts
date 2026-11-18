import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { ConfigProvider, DateTime, Effect, Layer, Option, Ref } from 'effect'
import { Cookies, HttpClient } from 'effect/http'

import { owner } from '@app-template/application/chat/testing'
import {
  AttachmentRepository,
  ChatRepository,
  MessageRepository,
  RunRepository,
  UserRepository,
} from '@app-template/kernel/data'
import { FileObjects, FileRepositoryTest } from '@app-template/kernel/data/testing'
import { TransactionTest } from '@app-template/packages/db/testing'
import { recordMessages } from '@app-template/packages/queue/testing'
import { epoch } from '@app-template/packages/testing'

import { ApiHttp } from '#api/layer'
import { ApiClient } from '#testing/api-client.test-layer'

/** The whole api process, clients and all, for the e2e journey that runs it beside the worker. */
export { ApiLayer } from '#api/layer'

/**
 * An `ApiClient` on `baseUrl` with a cookie jar of its own that starts from `cookies`, as a
 * browser's would, over the `HttpClient` in context; the `HttpClient` it puts in context sends
 * through the same jar.
 */
export const layerApiClient = (baseUrl = '', cookies = Cookies.empty) =>
  ApiClient.layer(baseUrl).pipe(
    Layer.provideMerge(
      Layer.effect(
        HttpClient.HttpClient,
        Ref.make(cookies).pipe(
          Effect.flatMap((jar) => HttpClient.HttpClient.useSync(HttpClient.withCookiesRef(jar))),
        ),
      ),
    ),
  )

/** What each repository answers in a case, as `Layer.mock` takes it; a method left out dies. */
export interface ApiRepositoryMocks {
  readonly users?: Layer.PartialEffectful<UserRepository['Service']>
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
  readonly runs?: Layer.PartialEffectful<RunRepository['Service']>
  readonly attachments?: Layer.PartialEffectful<AttachmentRepository['Service']>
}

/**
 * The api on an ephemeral port over `mocks`, the memory files, the identity transaction and a
 * queue that only records. Its `HttpClient` targets that port, and the files stay in context.
 *
 * A real server, not `HttpApiTest`: its client takes no cookie jar, and a defect is no response
 * there.
 */
export const layerApiServerTest = ({
  users = {},
  chats = {},
  messages = {},
  runs = {},
  attachments = {},
}: ApiRepositoryMocks = {}) =>
  ApiHttp.pipe(
    Layer.provide([
      TransactionTest,
      recordMessages().layer,
      Layer.mock(UserRepository, users),
      Layer.mock(ChatRepository, chats),
      Layer.mock(MessageRepository, messages),
      Layer.mock(RunRepository, runs),
      Layer.mock(AttachmentRepository, attachments),
    ]),
    Layer.provideMerge(BunHttpServer.layerTest),
    Layer.provideMerge(FileRepositoryTest),
    Layer.provideMerge(FileObjects.layer),
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
