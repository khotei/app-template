import { BunCrypto } from '@effect/platform-bun'
import { PgClient } from '@effect/sql-pg'
import { ConfigProvider, Effect, Layer, Redacted, Schema, Struct } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { ApiLayer, layerApiClient } from '@app-template/api/testing'
import { buildResourceName, resources } from '@app-template/kernel/aws'
import { AwsTest } from '@app-template/kernel/aws/testing/e2e'
import { AwsConfig } from '@app-template/kernel/config'
import { FileRepository } from '@app-template/kernel/data'
import { provisionWorker } from '@app-template/packages/aws'
import { LambdaClientTest } from '@app-template/packages/aws/testing/e2e'
import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { WorkerLayer } from '@app-template/worker/testing'

// `Config.Port` refuses 0, so neither app can take an ephemeral port itself.
const findFreePort = Effect.sync(() => {
  const probe = Bun.listen({ hostname: 'localhost', port: 0, socket: { data() {} } })
  const { port } = probe
  probe.stop(true)
  return port
})

/** What the fake Messages API answers each model of the stand, in the shape the apps' schemas read. */
export const fakeAnswers = {
  'e2e-reply': { text: 'The fake Messages API answering the whole reply at once.' },
  'e2e-title': { title: 'Fake chat title' },
} as const

type FakeModel = keyof typeof fakeAnswers

const decodeFakeRequest = Schema.decodeUnknownSync(
  Schema.Struct({ model: Schema.Literals(Struct.keys(fakeAnswers)) }),
)

/** A Messages API on a free port answering each request with its model's answer, for the layer's life. */
const serveFakeAnthropic = Effect.acquireRelease(
  Effect.sync(() =>
    Bun.serve({
      port: 0,
      fetch: async (request) => {
        const { model } = decodeFakeRequest(await request.json())
        return Response.json({
          id: 'msg_e2e',
          type: 'message',
          role: 'assistant',
          model,
          content: [{ type: 'text', text: JSON.stringify(fakeAnswers[model]) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            cache_creation: null,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            input_tokens: 10,
            output_tokens: 5,
            service_tier: null,
          },
        })
      },
    }),
  ),
  (server) => Effect.promise(() => server.stop(true)),
)

/** The processes' environment: the test's database, stage and fake Messages API, the rest as `.env.example` has it. */
const buildConfigProvider = Effect.fnUntraced(function* ({
  apiPort,
  workerPort,
  anthropicUrl,
}: {
  readonly apiPort: number
  readonly workerPort: number
  readonly anthropicUrl: string
}) {
  const { config } = yield* PgClient.PgClient
  const { region, endpoint, stage } = yield* AwsConfig
  const databaseUrl = yield* Effect.fromNullishOr(config.url)
  const awsEndpoint = yield* Effect.fromOption(endpoint)

  return ConfigProvider.fromUnknown({
    DATABASE_URL: Redacted.value(databaseUrl),
    AWS_REGION: region,
    AWS_ENDPOINT_URL: awsEndpoint.href,
    STAGE: stage,
    API_PORT: apiPort,
    WORKER_PORT: workerPort,
    NODE_ENV: 'test',
    LOG_LEVEL: 'Warn',
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'e2e',
    ANTHROPIC_API_URL: anthropicUrl,
    LLM_REPLY_MODEL: 'e2e-reply' satisfies FakeModel,
    LLM_TITLE_MODEL: 'e2e-title' satisfies FakeModel,
  })
})

const Apps = Layer.merge(ApiLayer, WorkerLayer).pipe(Layer.provide(BunCrypto.layer))

/**
 * The api and the worker in one runtime over the test's database, stage and fake Messages API,
 * with an `ApiClient` on the api; `SqlClient` and `FileRepository` stay in context for what the
 * test reads behind the apps.
 *
 * `PgClientTest`, not `DbTest`: a layer is built once per runtime, so `DbTest`'s `Db.layer` would
 * also serve the apps, bound to the test's client while their `Transaction` holds their own, and
 * every write would commit outside the transaction.
 */
export const StandTest = Layer.unwrap(
  Effect.gen(function* () {
    const apiPort = yield* findFreePort
    const workerPort = yield* findFreePort
    const { stage } = yield* AwsConfig
    yield* provisionWorker(resources, {
      buildName: (name) => buildResourceName(stage, name),
      proxyUrl: `http://host.docker.internal:${workerPort}/events`,
    })
    const anthropic = yield* serveFakeAnthropic
    const provider = yield* buildConfigProvider({
      apiPort,
      workerPort,
      anthropicUrl: anthropic.url.origin,
    })

    const browser = layerApiClient(`http://localhost:${apiPort}`).pipe(
      Layer.provide(FetchHttpClient.layer),
    )
    return Layer.merge(Apps, browser).pipe(Layer.provide(ConfigProvider.layer(provider)))
  }).pipe(Effect.orDie),
).pipe(
  Layer.provideMerge(FileRepository.layer),
  Layer.provideMerge([PgClientTest, AwsTest, LambdaClientTest]),
)
