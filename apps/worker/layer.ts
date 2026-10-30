import { BunCrypto } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { MinimumLogLevelFromConfig } from '@app-template/config'
import { AttachmentPgS3 } from '@app-template/infrastructure/attachment'
import { AssistantLlmFromConfig, ChatPg } from '@app-template/infrastructure/chat'
import { Db, Transaction } from '@app-template/infrastructure/db'
import { OutboxRelaySqs } from '@app-template/infrastructure/outbox'
import { QueueConsumerSqs } from '@app-template/infrastructure/shared'

import { AssistantMessageHandler } from '#worker/chat/assistant-message.handler'
import { ChatTitleHandler } from '#worker/chat/chat-title.handler'

const WorkerHandlers = Layer.mergeAll(AssistantMessageHandler, ChatTitleHandler).pipe(
  Layer.provide([ChatPg, AttachmentPgS3, AssistantLlmFromConfig, Transaction.layer]),
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

export const WorkerLayer = Layer.mergeAll(WorkerHandlers, OutboxRelaySqs, LogWorkerLifecycle).pipe(
  Layer.provide([Db.layerFromConfig, QueueConsumerSqs, BunCrypto.layer]),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(MinimumLogLevelFromConfig),
)
