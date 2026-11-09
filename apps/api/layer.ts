import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import {
  ChatService,
  CurrentReplyProvenanceFromConfig,
  FileAttachmentService,
  LiveAttachmentService,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import { UserService } from '@app-template/application/identity'
import { CreateUserMessageUseCase } from '@app-template/application/use-cases'
import { Api } from '@app-template/http-api'
import {
  QueueSenderOfStage,
  S3BucketFromConfig,
  SQSServiceFromConfig,
} from '@app-template/kernel/aws'
import {
  ApiConfig,
  AwsConfig,
  MinimumLogLevelFromConfig,
  RuntimeConfig,
} from '@app-template/kernel/config'
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
    LiveAttachmentService.layer,
    FileAttachmentService.layer,
    CreateUserMessageUseCase.layer,
    RuntimeConfig.layer,
  ]),
)

const BunHttpServerFromConfig = Layer.unwrap(
  ApiConfig.useSync(({ port }) => BunHttpServer.layer({ port })),
).pipe(Layer.provide(ApiConfig.layer))

const LogApiStopped = Layer.effectDiscard(Effect.addFinalizer(() => Effect.logInfo('api stopped')))

export const ApiLayer = Layer.merge(ApiHttp, LogApiStopped).pipe(
  Layer.provide([QueueSenderOfStage, Transaction.layer, CurrentReplyProvenanceFromConfig]),
  Layer.provide([
    UserRepository.layer,
    ChatRepository.layer,
    MessageRepository.layer,
    RunRepository.layer,
    AttachmentRepository.layer,
    FileRepository.layer,
  ]),
  Layer.provide(Db.layer),
  Layer.provide([PgClientFromConfig, S3BucketFromConfig, SQSServiceFromConfig, AwsConfig.layer]),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
)
