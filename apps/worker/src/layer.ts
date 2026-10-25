import { Effect, Layer } from 'effect'

import { AssistantMessageJob, ChatTitleJob } from '@app-template/application/chat'
import { MinimumLogLevelFromConfig } from '@app-template/config'
import { AttachmentPgS3 } from '@app-template/infrastructure/attachment'
import { ChatPg } from '@app-template/infrastructure/chat'
import { Db } from '@app-template/infrastructure/db'
import { OutboxRelay } from '@app-template/infrastructure/outbox'
import { QueueClientSqs, SQSServiceFromConfig } from '@app-template/infrastructure/shared'
import { LanguageModelStub } from '@app-template/llm'
import { QueueTransport } from '@app-template/queue'

const WorkerJobs = Layer.mergeAll(AssistantMessageJob.worker, ChatTitleJob.worker).pipe(
  Layer.provide([ChatPg, AttachmentPgS3]),
)

const OutboxRelaySqs = OutboxRelay.pipe(
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide(SQSServiceFromConfig),
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

export const WorkerLayer = Layer.mergeAll(WorkerJobs, OutboxRelaySqs, LogWorkerLifecycle).pipe(
  Layer.provide([Db.layerFromConfig, QueueClientSqs, LanguageModelStub]),
  Layer.provide(MinimumLogLevelFromConfig),
)
