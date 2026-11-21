import { Duration, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { UserService } from '@app-template/application/identity'
import { nodeEnv } from '@app-template/kernel/config'

import { Api } from '#api/api'
import { Auth } from '#api/shared/security'

const cookieMaxAge = Duration.days(365)

export const UserHandler = HttpApiBuilder.group(
  Api,
  'users',
  Effect.fnUntraced(function* (handlers) {
    const users = yield* UserService
    const env = yield* nodeEnv

    return handlers.handle(
      'recognise',
      Effect.fn('UserHandler.recognise')(function* () {
        const { user, secret } = yield* HttpApiBuilder.securityDecode(Auth.security.cookie).pipe(
          Effect.flatMap(users.recognise),
        )

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
