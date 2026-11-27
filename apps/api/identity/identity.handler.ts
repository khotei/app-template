import { Duration, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { Api, IdentityMiddleware, RequestIdentity } from '@app-template/application/http-api'
import { IdentityService } from '@app-template/application/identity'
import { nodeEnv } from '@app-template/kernel/config'

const cookieMaxAge = Duration.days(365)

export const IdentityHandler = HttpApiBuilder.group(
  Api,
  'identity',
  Effect.fnUntraced(function* (handlers) {
    const identityService = yield* IdentityService
    const env = yield* nodeEnv

    return handlers.handleAll({
      recognise: Effect.fn('IdentityHandler.recognise')(function* () {
        const presented = yield* HttpApiBuilder.securityDecode(IdentityMiddleware.security.cookie)
        const { identity, secret } = yield* identityService.recognise(presented)

        yield* HttpApiBuilder.securitySetCookie(IdentityMiddleware.security.cookie, secret, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: cookieMaxAge,
          secure: env === 'production',
        })
        return identity
      }),
      get: Effect.fn('IdentityHandler.get')(function* () {
        return yield* RequestIdentity
      }),
    })
  }),
)
