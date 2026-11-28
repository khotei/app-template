import { createServer } from 'node:http'

import { NodeHttpServer } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { Otlp, OtlpSerialization } from 'effect/observability'

import { ChatAssistant, ReplyChatService, TitleChatService } from '@app-template/application/chat'
import { MinimumLogLevelFromConfig, workerPort } from '@app-template/kernel/config'
import { Db, PostgresRepositories } from '@app-template/kernel/data'
import { AnthropicClientFromConfig } from '@app-template/kernel/llm'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { SqsEvent } from '@app-template/packages/aws/queue'
import { Transaction } from '@app-template/packages/db'

import { consumeEvent } from '#worker/worker.handler'

/** `POST /events`: the worker's route for the batch an SQS mapping invokes it with. */
const WorkerEvents = HttpRouter.add(
  'POST',
  '/events',
  Effect.gen(function* () {
    const event = yield* HttpServerRequest.schemaBodyJson(SqsEvent)
    const response = yield* consumeEvent(event)
    return HttpServerResponse.jsonUnsafe(response)
  }),
)

export const WorkerHttp = HttpRouter.serve(WorkerEvents).pipe(
  Layer.provide([ReplyChatService.layer, TitleChatService.layer]),
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

/** The worker process but its assistant, which the e2e stand scripts. */
export const WorkerProcess = Layer.merge(WorkerHttp, LogWorkerLifecycle).pipe(
  Layer.provide([PostgresRepositories, Transaction.layer]),
  Layer.provide(Db.layer),
  Layer.provide(PgClientFromConfig),
  Layer.provide(NodeHttpServer.layerConfig(createServer, { port: workerPort })),
  Layer.provide(MinimumLogLevelFromConfig),
)

export const WorkerLayer = WorkerProcess.pipe(
  Layer.provide(ChatAssistant.layer),
  Layer.provide(AnthropicClientFromConfig),
  Layer.provide(Otlp.layerFromConfig({ resource: { serviceName: 'worker' } })),
  Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerProtobuf]),
)
