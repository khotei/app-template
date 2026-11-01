import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import { AttachmentService, ChatService, MessageService } from '@app-template/chat/services'
import { Transaction } from '@app-template/db'
import { Api } from '@app-template/http-api'
import { UserService } from '@app-template/identity/services'
import { CurrentReplyProvenance } from '@app-template/infrastructure/chat'
import { S3BucketFromConfig } from '@app-template/kernel/aws'
import { ApiConfig, MinimumLogLevelFromConfig, RuntimeConfig } from '@app-template/kernel/config'
import { Db } from '@app-template/kernel/data'
import { AttachmentRepository } from '@app-template/kernel/data/attachment'
import { ChatRepository, MessageRepository } from '@app-template/kernel/data/chat'
import { FileRepository } from '@app-template/kernel/data/file'
import { JobRepository } from '@app-template/kernel/data/job'
import { UserRepository } from '@app-template/kernel/data/user'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { QueueSenderJobs } from '@app-template/kernel/queue'
import { SendMessageUseCase } from '@app-template/use-cases/chat'

import { AttachmentHandler } from '#api/attachment/attachment.handler'
import { ChatHandler } from '#api/chat/chat.handler'
import { HealthHandler } from '#api/health/health.handler'
import { AuthUserService, SchemaErrorsRequestInvalid } from '#api/shared/security'
import { UserHandler } from '#api/user/user.handler'

const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([HealthHandler, UserHandler, ChatHandler, AttachmentHandler]),
  Layer.provide([AuthUserService, SchemaErrorsRequestInvalid]),
)

export const ApiHttp = HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide([
    UserService.layer,
    ChatService.layer,
    MessageService.layer,
    AttachmentService.layer,
    SendMessageUseCase.layer,
    RuntimeConfig.layer,
  ]),
)

const BunHttpServerFromConfig = Layer.unwrap(
  ApiConfig.useSync(({ port }) => BunHttpServer.layer({ port })),
).pipe(Layer.provide(ApiConfig.layer))

const LogApiStopped = Layer.effectDiscard(Effect.addFinalizer(() => Effect.logInfo('api stopped')))

export const ApiLayer = Layer.merge(ApiHttp, LogApiStopped).pipe(
  Layer.provide([QueueSenderJobs, Transaction.layer, CurrentReplyProvenance.layerFromConfig]),
  Layer.provide([
    UserRepository.layer,
    ChatRepository.layer,
    MessageRepository.layer,
    AttachmentRepository.layer,
    JobRepository.layer,
    FileRepository.layer,
  ]),
  Layer.provide(Db.layer),
  Layer.provide([PgClientFromConfig, S3BucketFromConfig]),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
)
