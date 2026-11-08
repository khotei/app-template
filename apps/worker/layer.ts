import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'

import { AssistantLlmFromConfig } from '@app-template/application/chat'
import { S3BucketFromConfig, SQSServiceFromConfig } from '@app-template/kernel/aws'
import { MinimumLogLevelFromConfig, WorkerConfig } from '@app-template/kernel/config'
import {
  ChatRepository,
  Db,
  FileRepository,
  JobRepository,
  MessageRepository,
} from '@app-template/kernel/data'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { Transaction } from '@app-template/packages/db'

import { AssistantMessageHandler } from '#worker/chat/assistant-message.handler'
import { ChatTitleHandler } from '#worker/chat/chat-title.handler'
import { WorkerHandler } from '#worker/worker.handler'

export const WorkerHttp = HttpRouter.serve(WorkerHandler).pipe(
  Layer.provide([AssistantMessageHandler.layer, ChatTitleHandler.layer]),
  Layer.provide([AssistantLlmFromConfig, Transaction.layer]),
)

const BunHttpServerFromConfig = Layer.unwrap(
  WorkerConfig.useSync(({ port }) => BunHttpServer.layer({ port })),
).pipe(Layer.provide(WorkerConfig.layer))

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

export const WorkerLayer = Layer.merge(WorkerHttp, LogWorkerLifecycle).pipe(
  Layer.provide([
    ChatRepository.layer,
    MessageRepository.layer,
    JobRepository.layer,
    FileRepository.layer,
    BunCrypto.layer,
  ]),
  Layer.provide([Db.layer, SQSServiceFromConfig, S3BucketFromConfig]),
  Layer.provide(PgClientFromConfig),
  Layer.provide([FetchHttpClient.layer, BunHttpServerFromConfig]),
  Layer.provide(MinimumLogLevelFromConfig),
)
