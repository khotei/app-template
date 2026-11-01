import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import { Transaction } from '@app-template/db'
import { AttachmentService } from '@app-template/domain/attachment'
import { ChatService } from '@app-template/domain/chat'
import { Api } from '@app-template/http-api'
import { UserService } from '@app-template/identity/services'
import { AttachmentPgS3 } from '@app-template/infrastructure/attachment'
import { ChatPg, CurrentReplyProvenance } from '@app-template/infrastructure/chat'
import { UserPg } from '@app-template/infrastructure/user'
import { ApiConfig, MinimumLogLevelFromConfig, RuntimeConfig } from '@app-template/kernel/config'
import { Db } from '@app-template/kernel/data'
import { JobRepository } from '@app-template/kernel/data/job'
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
  Layer.provide([
    UserPg,
    ChatPg,
    AttachmentPgS3,
    QueueSenderJobs,
    Transaction.layer,
    CurrentReplyProvenance.layerFromConfig,
  ]),
  Layer.provide(JobRepository.layer),
  Layer.provide(Db.layer),
  Layer.provide(PgClientFromConfig),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
)
