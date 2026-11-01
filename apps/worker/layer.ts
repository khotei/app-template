import { BunCrypto } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { Transaction } from '@app-template/db'
import { AttachmentBucketS3FromConfig } from '@app-template/infrastructure/attachment'
import { AssistantLlmFromConfig } from '@app-template/infrastructure/chat'
import { SQSServiceFromConfig } from '@app-template/kernel/aws'
import { MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import { Db } from '@app-template/kernel/data'
import { ChatRepository, MessageRepository } from '@app-template/kernel/data/chat'
import { JobRepository } from '@app-template/kernel/data/job'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { JobRelaySqs, QueueConsumerSqs } from '@app-template/kernel/queue'

import { AssistantMessageHandler } from '#worker/chat/assistant-message.handler'
import { ChatTitleHandler } from '#worker/chat/chat-title.handler'

const WorkerHandlers = Layer.mergeAll(AssistantMessageHandler, ChatTitleHandler).pipe(
  Layer.provide([AttachmentBucketS3FromConfig, AssistantLlmFromConfig, Transaction.layer]),
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
    QueueConsumerSqs,
    BunCrypto.layer,
  ]),
  Layer.provide([Db.layer, SQSServiceFromConfig]),
  Layer.provide(PgClientFromConfig),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(MinimumLogLevelFromConfig),
)
