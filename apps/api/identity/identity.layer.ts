import { Effect, Layer } from 'effect'

import { Identity, IdentityMiddleware } from '@app-template/application/http-api'
import { IdentityService } from '@app-template/application/identity'

export const IdentityMiddlewareLayer = Layer.effect(
  IdentityMiddleware,
  Effect.gen(function* () {
    const identityService = yield* IdentityService
    return IdentityMiddleware.of({
      cookie: (httpEffect, { credential }) =>
        Effect.provideServiceEffect(httpEffect, Identity, identityService.authenticate(credential)),
    })
  }),
)
