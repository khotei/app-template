import { PgClient } from '@effect/sql-pg'
import { ConfigProvider, Effect, Layer, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { ApiLayer, layerApiClient } from '@app-template/api/testing'
import {
  AssistantReply,
  ChatAssistant,
  ChatTitle,
  MessageAssistant,
} from '@app-template/application/chat'
import { resources } from '@app-template/kernel/aws'
import { AwsTest, provisionWorker } from '@app-template/kernel/aws/testing/e2e'
import { awsConfig } from '@app-template/kernel/config'
import { LambdaClientTest } from '@app-template/packages/aws/testing/e2e'
import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { WorkerProcess } from '@app-template/worker/testing'

// `Config.Port` refuses 0, so neither app can take an ephemeral port itself.
const findFreePort = Effect.sync(() => {
  const probe = Bun.listen({ hostname: 'localhost', port: 0, socket: { data() {} } })
  const { port } = probe
  probe.stop(true)
  return port
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
  })
})

/** What the worker's assistants answer every reply and title in the stand. */
export const scriptedAnswers = {
  reply: new AssistantReply({ text: 'The scripted assistant answering the whole reply at once.' }),
  title: ChatTitle.make('Scripted chat title'),
}

const AssistantsTest = Layer.mergeAll(
  Layer.mock(MessageAssistant, { reply: () => Effect.succeed(scriptedAnswers.reply) }),
  Layer.mock(ChatAssistant, { suggestTitle: () => Effect.succeed(scriptedAnswers.title) }),
)

/** Fresh, so the apps share no layer with the test and run on the clients their config builds. */
const Apps = Layer.merge(ApiLayer, WorkerProcess).pipe(Layer.provide(AssistantsTest), Layer.fresh)

/**
 * The api and the worker in one runtime over the test's database and stage, the assistant scripted,
 * with an `ApiClient` on the api; `SqlClient` stays in context for what the test reads behind the
 * apps.
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

    const browser = layerApiClient(`http://localhost:${apiPort}`).pipe(
      Layer.provide(FetchHttpClient.layer),
    )
    return Layer.merge(Apps, browser).pipe(Layer.provide(ConfigProvider.layerAdd(provider)))
  }).pipe(Effect.orDie),
).pipe(Layer.provideMerge([PgClientTest, AwsTest, LambdaClientTest]))
