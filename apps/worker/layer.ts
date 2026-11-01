import { BunCrypto } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { Transaction } from '@app-template/db'
import { AttachmentPgS3 } from '@app-template/infrastructure/attachment'
import { AssistantLlmFromConfig, ChatPg } from '@app-template/infrastructure/chat'
import { SQSServiceFromConfig } from '@app-template/kernel/aws'
import { MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import { Db } from '@app-template/kernel/data'
import { JobRepository } from '@app-template/kernel/data/job'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { JobRelaySqs, QueueConsumerSqs } from '@app-template/kernel/queue'

import { AssistantMessageHandler } from '#worker/chat/assistant-message.handler'
import { ChatTitleHandler } from '#worker/chat/chat-title.handler'

const WorkerHandlers = Layer.mergeAll(AssistantMessageHandler, ChatTitleHandler).pipe(
  Layer.provide([ChatPg, AttachmentPgS3, AssistantLlmFromConfig, Transaction.layer]),
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

export const WorkerLayer = Layer.mergeAll(WorkerHandlers, JobRelaySqs, LogWorkerLifecycle).pipe(
  Layer.provide([JobRepository.layer, QueueConsumerSqs, BunCrypto.layer]),
  Layer.provide([Db.layer, SQSServiceFromConfig]),
  Layer.provide(PgClientFromConfig),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(MinimumLogLevelFromConfig),
)
