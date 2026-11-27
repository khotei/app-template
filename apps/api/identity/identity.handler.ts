import { Duration, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { Api, IdentityMiddleware } from '@app-template/application/http-api'
import { Identity, IdentityService } from '@app-template/application/identity'
import { nodeEnv } from '@app-template/kernel/config'

const cookieMaxAge = Duration.days(365)

export const IdentityHandler = HttpApiBuilder.group(
  Api,
  'identity',
  Effect.fnUntraced(function* (handlers) {
    const identityService = yield* IdentityService
    const env = yield* nodeEnv

    return handlers.handle(
      'recognise',
      Effect.fn('IdentityHandler.recognise')(function* () {
        const presented = yield* HttpApiBuilder.securityDecode(IdentityMiddleware.security.cookie)
        const { user, secret } = yield* identityService.recognise(presented)

        yield* HttpApiBuilder.securitySetCookie(IdentityMiddleware.security.cookie, secret, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: cookieMaxAge,
          secure: env === 'production',
        })
        return new Identity({ userId: user.id })
      }),
    )
  }),
)
