import { createServer } from 'node:http'

import { NodeCrypto, NodeHttpServer } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { Otlp, OtlpSerialization } from 'effect/observability'

import {
  AskChatService,
  ChatQueue,
  ChatService,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import { Api } from '@app-template/application/http-api'
import { IdentityService } from '@app-template/application/identity'
import { QueueSenderFromConfig } from '@app-template/kernel/aws'
import { apiPort, MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import { Db, PostgresRepositories } from '@app-template/kernel/data'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { Transaction } from '@app-template/packages/db'

import { ChatHandler } from '#api/chat/chat.handler'
import { HealthHandler } from '#api/health/health.handler'
import { IdentityHandler } from '#api/identity/identity.handler'
import { IdentityMiddlewareLayer } from '#api/identity/identity.layer'
import { SchemaErrorsLayer } from '#api/shared/request.layer'

/** The API contract's routes with their handlers and middlewares, on no server. */
export const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([HealthHandler, IdentityHandler, ChatHandler]),
  Layer.provide([IdentityMiddlewareLayer, SchemaErrorsLayer]),
)

/** The `application/` services the api's handlers and the use cases they call read. */
export const ApiUseCases = Layer.mergeAll(
  AskChatService.layer,
  ChatQueue.layer,
  ChatService.layer,
  MessageService.layer,
  RunService.layer,
  IdentityService.layer,
)

// After `serve`, which makes what a handler reads per request its own requirement. Each handler
// group yields its services when it is built, which a provide before `serve` would reach too; a
// use case a handler calls reads its services per request, which only a provide here reaches.
export const ApiHttp = HttpRouter.serve(ApiRoutes).pipe(Layer.provide(ApiUseCases))

const LogApiLifecycle = Effect.logInfo('api started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('api stopped'))),
  Layer.effectDiscard,
)

export const ApiLayer = Layer.merge(ApiHttp, LogApiLifecycle).pipe(
  Layer.provide([QueueSenderFromConfig, Transaction.layer]),
  Layer.provide(PostgresRepositories),
  Layer.provide(Db.layer),
  Layer.provide(PgClientFromConfig),
  Layer.provide([NodeHttpServer.layerConfig(createServer, { port: apiPort }), NodeCrypto.layer]),
  Layer.provide(MinimumLogLevelFromConfig),
  Layer.provide(
    Otlp.layerFromConfig({ resource: { serviceName: 'api' } }).pipe(
      Layer.provide([OtlpSerialization.layerProtobuf, FetchHttpClient.layer]),
    ),
  ),
)
