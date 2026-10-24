import { BunHttpServer, BunServices } from '@effect/platform-bun'
import { assert, it, layer } from '@effect/vitest'
import { Array as Arr, ConfigProvider, Effect, Layer, Option, Record as Rec, Ref } from 'effect'
import { Cookies, HttpClient, type HttpClientResponse } from 'effect/http'
import { OpenApi } from 'effect/http-api'

import { buildResourceName, provision, type Resources, resources } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import { Api, ApiClient } from '@app-template/http-api'
import { AttachmentRepositoryPg, AttachmentStoreS3 } from '@app-template/infrastructure/attachment'
import { Db } from '@app-template/infrastructure/db'
import { recordQueue } from '@app-template/queue/testing'
import { AwsClientsMiniStack, countObjects, ownStage, PgClientTest } from '@app-template/testing'

import { ApiHttp } from '#api/layer'

const attachmentsBucket = { buckets: resources.buckets, queues: {} } satisfies Resources

const AttachmentPgOwnBucket = Layer.mergeAll(AttachmentRepositoryPg, AttachmentStoreS3).pipe(
  Layer.provideMerge(ownStage((stage) => Effect.orDie(provision(attachmentsBucket, stage)))),
)

/**
 * The api on an ephemeral port over a fresh database, a bucket of its own on the suite's MiniStack
 * and a queue that records what it is sent; its `HttpClient` targets that port, and its `Db` is
 * open for arranging what only the worker writes.
 */
const makeApiHarness = () =>
  ApiHttp.pipe(
    Layer.provideMerge(AttachmentPgOwnBucket),
    Layer.provideMerge(BunHttpServer.layerTest),
    Layer.provideMerge(Db.layer.pipe(Layer.provideMerge(PgClientTest))),
    Layer.provide([
      recordQueue().layer,
      BunServices.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({})),
    ]),
  )

/** The suite every api test runs in: the MiniStack its harnesses take their own bucket from. */
export const apiSuite = layer(AwsClientsMiniStack, { timeout: '60 seconds' })

export const countStoredObjects = Effect.flatMap(AwsConfig, ({ stage }) =>
  countObjects(buildResourceName(stage, resources.buckets.attachments.name)),
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

type Browse = <A, E, R>(
  body: (api: ApiClient['Service'], http: HttpClient.HttpClient) => Effect.Effect<A, E, R>,
  cookies?: Cookies.Cookies,
) => Effect.Effect<A, E, Exclude<R, ApiClient | HttpClient.HttpClient>>

/**
 * Runs `body` on an api of the test's own (no row, object or server is shared with another
 * test), with an `ApiClient` whose cookie jar starts from `cookies`, as a browser's would, and a
 * raw `HttpClient` on the same jar, for the requests and bodies the client cannot express.
 * `browse` opens another browser, with a jar of its own, on the same api.
 */
export const withApi = <A, E, R>(
  body: (
    api: ApiClient['Service'],
    http: HttpClient.HttpClient,
    browse: Browse,
  ) => Effect.Effect<A, E, R>,
  cookies: Cookies.Cookies = Cookies.empty,
) =>
  Effect.gen(function* () {
    const server = yield* HttpClient.HttpClient
    const browse: Browse = (inner, jar = Cookies.empty) =>
      Effect.flatMap(Effect.zip(ApiClient, HttpClient.HttpClient), ([api, http]) =>
        inner(api, http),
      ).pipe(
        Effect.provide(apiClientWithJar(jar)),
        Effect.provideService(HttpClient.HttpClient, server),
      )
    return yield* browse((api, http) => body(api, http, browse), cookies)
  }).pipe(Effect.provide(makeApiHarness()))

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

type Method = (typeof methods)[number]

export interface Route {
  readonly method: Method
  readonly path: string
  readonly responses: Record<string, string>
}

/** The responses every operation under `Auth` lists, before its own. */
export const underAuth = { 400: 'RequestInvalidError', 401: 'UserUnknownError' } as const

/** Asserts that the spec lists each route under the cookie scheme with exactly these statuses. */
export const testSpecDocuments = (routes: ReadonlyArray<Route>) =>
  it.effect.each(routes)(
    'the spec documents $method $path under the cookie with its statuses',
    ({ method, path, responses }) =>
      Effect.sync(() => {
        const operation = spec.paths[path]?.[method]

        assert.deepStrictEqual(operation?.security, [{ cookie: [] }])
        assert.deepStrictEqual(
          Rec.map(operation?.responses ?? {}, ({ description }) => description),
          responses,
        )
      }),
  )
