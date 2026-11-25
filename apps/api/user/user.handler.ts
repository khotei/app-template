import { Duration, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { Api, Auth } from '@app-template/application/http-api'
import { IdentityService } from '@app-template/application/identity'
import { nodeEnv } from '@app-template/kernel/config'

const cookieMaxAge = Duration.days(365)

export const UserHandler = HttpApiBuilder.group(
  Api,
  'users',
  Effect.fnUntraced(function* (handlers) {
    const identity = yield* IdentityService
    const env = yield* nodeEnv

    return handlers.handle(
      'recognise',
      Effect.fn('UserHandler.recognise')(function* () {
        const presented = yield* HttpApiBuilder.securityDecode(Auth.security.cookie)
        const { user, secret } = yield* identity.recognise(presented)

        yield* HttpApiBuilder.securitySetCookie(Auth.security.cookie, secret, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: cookieMaxAge,
          secure: env === 'production',
        })
        return user
      }),
    )
  }),
)
