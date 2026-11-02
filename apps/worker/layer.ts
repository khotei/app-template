import { BunCrypto } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { AssistantLlmFromConfig } from '@app-template/application/chat'
import { S3BucketFromConfig, SQSServiceFromConfig } from '@app-template/kernel/aws'
import { MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import {
  ChatRepository,
  Db,
  FileRepository,
  JobRepository,
  MessageRepository,
} from '@app-template/kernel/data'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { JobRelaySqs, QueueConsumerSqs } from '@app-template/kernel/queue'
import { Transaction } from '@app-template/packages/db'

import { AssistantMessageHandler } from '#worker/chat/assistant-message.handler'
import { ChatTitleHandler } from '#worker/chat/chat-title.handler'

const WorkerHandlers = Layer.mergeAll(AssistantMessageHandler, ChatTitleHandler).pipe(
  Layer.provide([AssistantLlmFromConfig, Transaction.layer]),
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

export const WorkerLayer = Layer.mergeAll(WorkerHandlers, JobRelaySqs, LogWorkerLifecycle).pipe(
  Layer.provide([
    ChatRepository.layer,
    MessageRepository.layer,
    JobRepository.layer,
    FileRepository.layer,
    QueueConsumerSqs,
    BunCrypto.layer,
  ]),
  Layer.provide([Db.layer, SQSServiceFromConfig, S3BucketFromConfig]),
  Layer.provide(PgClientFromConfig),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(MinimumLogLevelFromConfig),
)
