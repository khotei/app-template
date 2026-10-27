import { Duration, Effect, Option, Redacted } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { UserService } from '@app-template/application/user'
import { RuntimeConfig } from '@app-template/config'
import { Api, Auth } from '@app-template/http-api'

const cookieMaxAge = Duration.days(365)

// A request without the cookie decodes to an empty secret, not a failure.
const isPresented = (secret: Redacted.Redacted) => Redacted.value(secret) !== ''

export const UserHandler = HttpApiBuilder.group(
  Api,
  'users',
  Effect.fnUntraced(function* (handlers) {
    const users = yield* UserService
    const { nodeEnv } = yield* RuntimeConfig

    return handlers.handle(
      'ensure',
      Effect.fn('UserHandler.ensure')(function* () {
        const presented = yield* HttpApiBuilder.securityDecode(Auth.security.cookie)
        const { user, secret } = yield* users.ensure(Option.liftPredicate(presented, isPresented))

        yield* HttpApiBuilder.securitySetCookie(Auth.security.cookie, secret, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: cookieMaxAge,
          secure: nodeEnv === 'production',
        })
        return user
      }),
    )
  }),
)
