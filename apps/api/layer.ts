import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { Otlp, OtlpSerialization } from 'effect/observability'

import {
  AskChatService,
  ChatService,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import { UserService } from '@app-template/application/identity'
import { QueueSenderFromConfig } from '@app-template/kernel/aws'
import { apiPort, MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import { Db, PostgresRepositories } from '@app-template/kernel/data'
import { PgClientFromConfig } from '@app-template/kernel/postgres'
import { Transaction } from '@app-template/packages/db'

import { Api } from '#api/api'
import { ChatHandler } from '#api/chat/chat.handler'
import { HealthHandler } from '#api/health/health.handler'
import { Auth, SchemaErrors } from '#api/shared/api-security'
import { UserHandler } from '#api/user/user.handler'

const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([HealthHandler, UserHandler, ChatHandler]),
  Layer.provide([Auth.layer, SchemaErrors.layer]),
)

// After `serve`, which makes what a handler reads per request its own requirement: a use case
// the handler calls reads its services so, and a handler group's provide never reaches them.
export const ApiHttp = HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide([
    AskChatService.layer,
    ChatService.layer,
    MessageService.layer,
    RunService.layer,
    UserService.layer,
  ]),
)

const BunHttpServerFromConfig = apiPort.pipe(
  Effect.map((port) => BunHttpServer.layer({ port })),
  Layer.unwrap,
)

const LogApiLifecycle = Effect.logInfo('api started').pipe(
  Effect.andThen(Effect.addFinalizer(() => Effect.logInfo('api stopped'))),
  Layer.effectDiscard,
)

export const ApiLayer = Layer.merge(ApiHttp, LogApiLifecycle).pipe(
  Layer.provide([QueueSenderFromConfig, Transaction.layer]),
  Layer.provide(PostgresRepositories),
  Layer.provide(Db.layer),
  Layer.provide(PgClientFromConfig),
  Layer.provide([BunHttpServerFromConfig, BunCrypto.layer]),
  Layer.provide(MinimumLogLevelFromConfig),
  Layer.provide(
    Otlp.layerFromConfig({ resource: { serviceName: 'api' } }).pipe(
      Layer.provide([OtlpSerialization.layerProtobuf, FetchHttpClient.layer]),
    ),
  ),
)
