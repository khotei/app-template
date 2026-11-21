import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { Otlp, OtlpSerialization } from 'effect/observability'

import {
  ChatAssistant,
  ChatService,
  MessageAssistant,
  MessageService,
  MoveRunService,
  ReplyChatService,
  RunService,
} from '@app-template/application/chat'
import { MinimumLogLevelFromConfig, workerPort } from '@app-template/kernel/config'
import { Db, PostgresRepositories } from '@app-template/kernel/data'
import { AnthropicClientFromConfig } from '@app-template/kernel/llm'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { Transaction } from '@app-template/packages/db'

import { WorkerHandler } from '#worker/worker.handler'

export const WorkerHttp = HttpRouter.serve(WorkerHandler).pipe(
  Layer.provide(ReplyChatService.layer),
  Layer.provide(MoveRunService.layer),
  Layer.provide([ChatService.layer, MessageService.layer, RunService.layer]),
)

const BunHttpServerFromConfig = workerPort.pipe(
  Effect.map((port) => BunHttpServer.layer({ port })),
  Layer.unwrap,
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

/** The worker process but its assistants, which the e2e stand scripts. */
export const WorkerProcess = Layer.merge(WorkerHttp, LogWorkerLifecycle).pipe(
  Layer.provide([PostgresRepositories, Transaction.layer]),
  Layer.provide(Db.layer),
  Layer.provide(PgClientFromConfig),
  Layer.provide([BunHttpServerFromConfig, BunCrypto.layer]),
  Layer.provide(MinimumLogLevelFromConfig),
)

export const WorkerLayer = WorkerProcess.pipe(
  Layer.provide([MessageAssistant.layer, ChatAssistant.layer]),
  Layer.provide(AnthropicClientFromConfig),
  Layer.provide(Otlp.layerFromConfig({ resource: { serviceName: 'worker' } })),
  Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerProtobuf]),
)
