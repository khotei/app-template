import { BunCrypto } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import { AssistantMessageJob } from '@app-template/application/chat'
import { MinimumLogLevelFromConfig } from '@app-template/config'
import { AttachmentPgS3 } from '@app-template/infrastructure/attachment'
import { AssistantLlm, ChatPg } from '@app-template/infrastructure/chat'
import { Db } from '@app-template/infrastructure/db'
import { OutboxRelaySqs } from '@app-template/infrastructure/outbox'
import { QueueClientSqs } from '@app-template/infrastructure/shared'
import { LanguageModelStub } from '@app-template/llm'

import { ChatTitleHandler } from '#worker/chat/chat-title.handler'

const WorkerJobs = Layer.mergeAll(
  AssistantMessageJob.worker,
  AssistantMessageJob.deadLetterWorker,
  ChatTitleHandler,
).pipe(Layer.provide([ChatPg, AttachmentPgS3, AssistantLlm]))

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

export const WorkerLayer = Layer.mergeAll(WorkerJobs, OutboxRelaySqs, LogWorkerLifecycle).pipe(
  Layer.provide([Db.layerFromConfig, QueueClientSqs, LanguageModelStub, BunCrypto.layer]),
  Layer.provide(MinimumLogLevelFromConfig),
)
