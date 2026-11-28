import { type AddressInfo, createServer } from 'node:net'

import { PgClient } from '@effect/sql-pg'
import { ConfigProvider, Effect, Layer, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { ApiLayer, layerApiClient, StrangerApiClient } from '@app-template/api/testing'
import { AssistantReply, ChatAssistant, ChatTitle } from '@app-template/application/chat'
import { resources } from '@app-template/kernel/aws'
import { AwsTest, provisionWorker } from '@app-template/kernel/aws/testing/e2e'
import { awsConfig } from '@app-template/kernel/config'
import { LambdaClientTest } from '@app-template/packages/aws/testing/e2e'
import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { WorkerProcess } from '@app-template/worker/testing'

// `Config.Port` refuses 0, so neither app can take an ephemeral port itself.
const findFreePort = Effect.callback<number>((resume) => {
  const probe = createServer().listen(0, 'localhost', () => {
    const { port } = probe.address() as AddressInfo
    probe.close(() => resume(Effect.succeed(port)))
  })
})

/**
 * The processes' environment beside `AwsTest`'s, which is asked first: the test's database, the
 * rest as `.env.example` has it.
 */
const buildConfigProvider = Effect.fnUntraced(function* (apiPort: number, workerPort: number) {
  const { config } = yield* PgClient.PgClient
  const databaseUrl = yield* Effect.fromNullishOr(config.url)

  return ConfigProvider.fromUnknown({
    DATABASE_URL: Redacted.value(databaseUrl),
    API_PORT: apiPort,
    WORKER_PORT: workerPort,
    NODE_ENV: 'test',
    LOG_LEVEL: 'Warn',
    LLM_CHAT_CONTEXT_TOKENS_LIMIT: 1_000_000,
  })
})

/** What the worker's assistant answers every reply and title in the stand. */
export const scriptedAnswers = {
  reply: new AssistantReply({
    text: 'The scripted assistant answering the whole reply at once.',
    usage: {
      model: 'claude-sonnet-5-5',
      promptTokens: 130,
      outputTokens: 5,
      cacheReadTokens: 100,
      cacheWriteTokens: 20,
    },
  }),
  title: ChatTitle.make('Scripted chat title'),
}

const ChatAssistantTest = Layer.mock(ChatAssistant, {
  reply: () => Effect.succeed(scriptedAnswers.reply),
  proposeTitle: () => Effect.succeed(scriptedAnswers.title),
})

/** Fresh, so the apps share no layer with the test and run on the clients their config builds. */
const Apps = Layer.merge(ApiLayer, WorkerProcess).pipe(
  Layer.provide(ChatAssistantTest),
  Layer.fresh,
)

/**
 * The api and the worker in one runtime over the test's database and stage, the assistant scripted,
 * with an `ApiClient` and a stranger's on the api; `SqlClient` stays in context for what the test
 * reads behind the apps.
 */
export const StandTest = Layer.unwrap(
  Effect.gen(function* () {
    const apiPort = yield* findFreePort
    const workerPort = yield* findFreePort
    const { stage } = yield* awsConfig
    yield* provisionWorker(resources, {
      stage,
      proxyUrl: `http://host.docker.internal:${workerPort}/events`,
    })
    const provider = yield* buildConfigProvider(apiPort, workerPort)

    const apiUrl = `http://localhost:${apiPort}`
    const browsers = Layer.mergeAll(layerApiClient(apiUrl), StrangerApiClient.layer(apiUrl))
    return Layer.merge(Apps, browsers.pipe(Layer.provide(FetchHttpClient.layer))).pipe(
      Layer.provide(ConfigProvider.layerAdd(provider)),
    )
  }).pipe(Effect.orDie),
).pipe(Layer.provideMerge([PgClientTest, AwsTest, LambdaClientTest]))
