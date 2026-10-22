import { BunServices } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import { AssistantMessageJob, ChatTitleJob } from '@app-template/application/chat'
import { MinimumLogLevelFromConfig } from '@app-template/config'
import { AttachmentKvS3 } from '@app-template/infrastructure/attachment'
import { ChatKv } from '@app-template/infrastructure/chat'
import { KeyValueStoreFileSystem } from '@app-template/infrastructure/kv'
import { QueueClientSqs } from '@app-template/infrastructure/shared'
import { LanguageModelStub } from '@app-template/llm'

const WorkerJobs = Layer.mergeAll(AssistantMessageJob.worker, ChatTitleJob.worker).pipe(
  Layer.provide([ChatKv, AttachmentKvS3]),
)

const LogWorkerLifecycle = Effect.logInfo('worker started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('worker stopped'))),
  Layer.effectDiscard,
)

export const WorkerLayer = Layer.merge(WorkerJobs, LogWorkerLifecycle).pipe(
  Layer.provide([KeyValueStoreFileSystem, QueueClientSqs, LanguageModelStub]),
  Layer.provide(BunServices.layer),
  Layer.provide(MinimumLogLevelFromConfig),
)
