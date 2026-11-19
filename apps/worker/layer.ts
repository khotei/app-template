import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { Otlp, OtlpSerialization } from 'effect/observability'

import {
  AssistantLlmFromConfig,
  ChatService,
  FileAttachmentService,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import { S3BucketFromConfig } from '@app-template/kernel/aws'
import { MinimumLogLevelFromConfig, workerPort } from '@app-template/kernel/config'
import { Db, FileRepository, PostgresRepositories } from '@app-template/kernel/data'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { Transaction } from '@app-template/packages/db'

import { WorkerHandler } from '#worker/worker.handler'

export const WorkerHttp = HttpRouter.serve(WorkerHandler).pipe(
  Layer.provide([
    ChatService.layer,
    FileAttachmentService.layer,
    MessageService.layer,
    RunService.layer,
  ]),
)

const BunHttpServerFromConfig = workerPort.pipe(
  Effect.map((port) => BunHttpServer.layer({ port })),
  Layer.unwrap,
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

/** The worker process but its `Assistant`, which the e2e stand scripts. */
export const WorkerProcess = Layer.merge(WorkerHttp, LogWorkerLifecycle).pipe(
  Layer.provide([PostgresRepositories, FileRepository.layer, Transaction.layer]),
  Layer.provide([Db.layer, S3BucketFromConfig]),
  Layer.provide(PgClientFromConfig),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
)

export const WorkerLayer = WorkerProcess.pipe(
  Layer.provide(AssistantLlmFromConfig),
  Layer.provide(Otlp.layerFromConfig({ resource: { serviceName: 'worker' } })),
  Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerProtobuf]),
)
