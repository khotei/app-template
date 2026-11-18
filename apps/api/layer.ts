import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { Otlp, OtlpSerialization } from 'effect/observability'

import {
  AttachmentService,
  ChatService,
  FileAttachmentService,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import { UserService } from '@app-template/application/identity'
import { CreateUserMessageUseCase, RetryRunUseCase } from '@app-template/application/use-cases'
import { Api } from '@app-template/http-api'
import {
  QueueSenderOfStage,
  S3BucketFromConfig,
  SQSServiceFromConfig,
} from '@app-template/kernel/aws'
import { apiPort, MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import {
  AttachmentRepository,
  ChatRepository,
  Db,
  FileRepository,
  MessageRepository,
  RunRepository,
  UserRepository,
} from '@app-template/kernel/data'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { Transaction } from '@app-template/packages/db'

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
    RunService.layer,
    AttachmentService.layer,
    FileAttachmentService.layer,
    CreateUserMessageUseCase.layer,
    RetryRunUseCase.layer,
  ]),
)

const BunHttpServerFromConfig = apiPort.pipe(
  Effect.map((port) => BunHttpServer.layer({ port })),
  Layer.unwrap,
)

const LogApiStopped = Layer.effectDiscard(Effect.addFinalizer(() => Effect.logInfo('api stopped')))

export const ApiLayer = Layer.merge(ApiHttp, LogApiStopped).pipe(
  Layer.provide([QueueSenderOfStage, Transaction.layer]),
  Layer.provide([
    UserRepository.layer,
    ChatRepository.layer,
    MessageRepository.layer,
    RunRepository.layer,
    AttachmentRepository.layer,
    FileRepository.layer,
  ]),
  Layer.provide(Db.layer),
  Layer.provide([PgClientFromConfig, S3BucketFromConfig, SQSServiceFromConfig]),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
  Layer.provide(
    Otlp.layerFromConfig({ resource: { serviceName: 'api' } }).pipe(
      Layer.provide([OtlpSerialization.layerProtobuf, FetchHttpClient.layer]),
    ),
  ),
)
