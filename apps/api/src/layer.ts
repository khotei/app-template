import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { HttpApiBuilder, HttpApiScalar } from 'effect/http-api'

import { UserService } from '@app-template/application/user'
import { ApiConfig, MinimumLogLevelFromConfig, RuntimeConfig } from '@app-template/config'
import { Api } from '@app-template/http-api'
import { KeyValueStoreFileSystem } from '@app-template/infrastructure/kv'
import { UserRepositoryKv } from '@app-template/infrastructure/user'

import { HealthHandler } from '#api/health/health.handler'
import { AuthUserService, SchemaErrorsRequestInvalid } from '#api/shared/security'
import { UserHandler } from '#api/user/user.handler'

const ApiRoutes = Layer.mergeAll(
  HttpApiBuilder.layer(Api, { openapiPath: '/openapi.json' }).pipe(
    Layer.provide([HealthHandler, UserHandler]),
    Layer.provide([AuthUserService, SchemaErrorsRequestInvalid]),
  ),
  HttpApiScalar.layer(Api, { path: '/docs' }),
)

/** The api's routes, served on an open `HttpServer`, `KeyValueStore` and platform services. */
export const ApiHttp = HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide([UserService.layer, RuntimeConfig.layer]),
  Layer.provide(UserRepositoryKv),
)

const BunHttpServerFromConfig = Layer.unwrap(
  Effect.map(ApiConfig, ({ port }) => BunHttpServer.layer({ port })),
).pipe(Layer.provide(ApiConfig.layer))

const LogApiStopped = Layer.effectDiscard(Effect.addFinalizer(() => Effect.logInfo('api stopped')))

export const ApiLayer = Layer.merge(ApiHttp, LogApiStopped).pipe(
  Layer.provide(KeyValueStoreFileSystem),
  Layer.provide(BunHttpServerFromConfig),
  Layer.provide(MinimumLogLevelFromConfig),
)
