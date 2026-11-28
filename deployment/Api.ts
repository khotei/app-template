import * as AWS from '@alchemy.run/aws'
import * as SQL from '@alchemy.run/sql/Postgres'
import { NodeCrypto } from '@effect/platform-node'
import { Duration, Effect, Layer } from 'effect'
import { Etag, HttpEffect, HttpPlatform, HttpRouter, type HttpServerResponse } from 'effect/http'

import { ApiRoutes, ApiUseCases } from '@app-template/api/layer'
import { MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import { Db, PostgresRepositories } from '@app-template/kernel/data'
import { Transaction } from '@app-template/packages/db'

import { QueueSenderFromBindings } from '#deployment/Bindings'
import { Database, databaseName } from '#deployment/Database'

/** The api as a function: its routes and use cases built once, over the stack's own resources. */
export default class Api extends AWS.Lambda.Function<Api>()(
  'Api',
  // Lambda's default of 128 MB ends the function while it loads.
  { main: import.meta.url, functionUrl: true, timeout: Duration.seconds(30), memorySize: 1024 },
  Effect.gen(function* () {
    const connect = yield* AWS.RDS.Connect(yield* Database, { database: databaseName })
    const Postgres = SQL.PostgresLayer({ url: Effect.map(connect, ({ url }) => url) })

    const infrastructure = yield* Layer.mergeAll(QueueSenderFromBindings, Transaction.layer).pipe(
      Layer.provideMerge(PostgresRepositories),
      Layer.provideMerge(Db.layer),
      Layer.provideMerge(Postgres),
      Layer.provideMerge([NodeCrypto.layer, MinimumLogLevelFromConfig]),
      Layer.build,
      Effect.map(Layer.succeedContext),
    )
    const useCases = yield* ApiUseCases.pipe(
      Layer.provide(infrastructure),
      Layer.build,
      Effect.map(Layer.succeedContext),
    )
    const routes = yield* HttpRouter.toHttpEffect(
      ApiRoutes.pipe(
        Layer.provide([infrastructure, useCases]),
        Layer.provide([HttpPlatform.layer, Etag.layer]),
      ),
    )

    // Alchemy runs `fetch` bare, so a pre-response handler (the identity's cookie) would never
    // run; `toHandled` runs them, as Effect's own servers do, and hands the response it sends.
    const fetch = Effect.gen(function* () {
      let sent: HttpServerResponse.HttpServerResponse | undefined
      yield* HttpEffect.toHandled(routes, (_request, response) =>
        Effect.sync(() => {
          sent = response
        }),
      )
      return yield* Effect.fromNullishOr(sent).pipe(Effect.orDie)
    })

    return { fetch: fetch.pipe(Effect.provide(useCases)) }
  }).pipe(Effect.provide([AWS.RDS.ConnectHttp, AWS.SQS.SendMessageHttp])),
) {}
