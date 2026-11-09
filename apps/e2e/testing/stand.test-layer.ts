import { BunCrypto } from '@effect/platform-bun'
import { PgClient } from '@effect/sql-pg'
import { ConfigProvider, Effect, Layer, Option, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { ApiLayer, layerApiClient } from '@app-template/api/testing'
import { AssistantReply, ChatTitle } from '@app-template/application/chat'
import { recordAssistant } from '@app-template/application/chat/testing'
import { buildResourceName, resources } from '@app-template/kernel/aws'
import { AwsTest } from '@app-template/kernel/aws/testing/e2e'
import { AwsConfig } from '@app-template/kernel/config'
import { FileRepository } from '@app-template/kernel/data'
import { provisionWorker } from '@app-template/packages/aws'
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

/** The processes' environment: the test's database and stage, the rest as `.env.example` has it. */
const buildConfigProvider = Effect.fnUntraced(function* (apiPort: number, workerPort: number) {
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
    LLM_REPLY_MODEL: 'e2e-reply',
  })
})

/** What the worker's `Assistant` answers every reply and title in the stand. */
export const scriptedAnswers = {
  reply: new AssistantReply({ text: 'The scripted assistant answering the whole reply at once.' }),
  title: ChatTitle.make('Scripted chat title'),
}

const { layer: AssistantTest } = recordAssistant({
  reply: Effect.succeed(scriptedAnswers.reply),
  suggestTitle: Effect.succeed(Option.some(scriptedAnswers.title)),
})

const Apps = Layer.merge(ApiLayer, WorkerProcess).pipe(
  Layer.provide([BunCrypto.layer, AssistantTest]),
)

/**
 * The api and the worker in one runtime over the test's database and stage, the assistant scripted,
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
    const provider = yield* buildConfigProvider(apiPort, workerPort)

    const browser = layerApiClient(`http://localhost:${apiPort}`).pipe(
      Layer.provide(FetchHttpClient.layer),
    )
    return Layer.merge(Apps, browser).pipe(Layer.provide(ConfigProvider.layer(provider)))
  }).pipe(Effect.orDie),
).pipe(
  Layer.provideMerge(FileRepository.layer),
  Layer.provideMerge([PgClientTest, AwsTest, LambdaClientTest]),
)
