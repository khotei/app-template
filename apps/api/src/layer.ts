import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { HttpApiBuilder, HttpApiScalar } from 'effect/http-api'

import { AttachmentService } from '@app-template/application/attachment'
import { ChatService, DeleteChatUseCase, SendMessageUseCase } from '@app-template/application/chat'
import { UserService } from '@app-template/application/user'
import { ApiConfig, MinimumLogLevelFromConfig, RuntimeConfig } from '@app-template/config'
import { Api } from '@app-template/http-api'
import { AttachmentKvS3 } from '@app-template/infrastructure/attachment'
import { ChatKv } from '@app-template/infrastructure/chat'
import { KeyValueStoreFileSystem } from '@app-template/infrastructure/kv'
import { QueueClientSqlite } from '@app-template/infrastructure/shared'
import { UserKv } from '@app-template/infrastructure/user'

import { AttachmentHandler } from '#api/attachment/attachment.handler'
import { ChatHandler } from '#api/chat/chat.handler'
import { HealthHandler } from '#api/health/health.handler'
import { AuthUserService, SchemaErrorsRequestInvalid } from '#api/shared/security'
import { UserHandler } from '#api/user/user.handler'

const ApiRoutes = Layer.mergeAll(
  HttpApiBuilder.layer(Api, { openapiPath: '/openapi.json' }).pipe(
    Layer.provide([HealthHandler, UserHandler, ChatHandler, AttachmentHandler]),
    Layer.provide([AuthUserService, SchemaErrorsRequestInvalid]),
  ),
  HttpApiScalar.layer(Api, { path: '/docs' }),
)

/**
 * The api's routes, served on an open `HttpServer`, `KeyValueStore`, `QueueClient`, attachment
 * aggregate and platform services.
 */
export const ApiHttp = HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide([
    UserService.layer,
    ChatService.layer,
    AttachmentService.layer,
    SendMessageUseCase.layer,
    DeleteChatUseCase.layer,
    RuntimeConfig.layer,
  ]),
  Layer.provide([UserKv, ChatKv]),
)

const BunHttpServerFromConfig = Layer.unwrap(
  Effect.map(ApiConfig, ({ port }) => BunHttpServer.layer({ port })),
).pipe(Layer.provide(ApiConfig.layer))

const LogApiStopped = Layer.effectDiscard(Effect.addFinalizer(() => Effect.logInfo('api stopped')))

export const ApiLayer = Layer.merge(ApiHttp, LogApiStopped).pipe(
  Layer.provide(AttachmentKvS3),
  Layer.provide([KeyValueStoreFileSystem, QueueClientSqlite]),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
)
