import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import { SendMessageUseCase } from '@app-template/application/chat'
import { ApiConfig, MinimumLogLevelFromConfig, RuntimeConfig } from '@app-template/config'
import { AttachmentService } from '@app-template/domain/attachment'
import { ChatService } from '@app-template/domain/chat'
import { UserService } from '@app-template/domain/user'
import { Api } from '@app-template/http-api'
import { AttachmentPgS3 } from '@app-template/infrastructure/attachment'
import { ChatPg, CurrentReplyProvenance } from '@app-template/infrastructure/chat'
import { Db, Transaction } from '@app-template/infrastructure/db'
import { QueueSenderOutbox } from '@app-template/infrastructure/shared'
import { UserPg } from '@app-template/infrastructure/user'

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
    QueueSenderOutbox,
    Transaction.layer,
    CurrentReplyProvenance.layerFromConfig,
  ]),
  Layer.provide(Db.layerFromConfig),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
)
