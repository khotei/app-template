import { Duration, Effect, Layer, Option, Redacted } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { UserService } from '@app-template/application/identity'
import { nodeEnv } from '@app-template/kernel/config'

import { Api } from '#api/api'
import { Auth } from '#api/shared/security'

const cookieMaxAge = Duration.days(365)

// A request without the cookie decodes to an empty secret, not a failure.
const isNonEmptySecret = (secret: Redacted.Redacted) => Redacted.value(secret) !== ''

export const UserHandler = HttpApiBuilder.group(
  Api,
  'users',
  Effect.fnUntraced(function* (handlers) {
    const users = yield* UserService
    const env = yield* nodeEnv

    return handlers.handle(
      'ensure',
      Effect.fn('UserHandler.ensure')(function* () {
        const { user, secret } = yield* HttpApiBuilder.securityDecode(Auth.security.cookie).pipe(
          Effect.map(Option.liftPredicate(isNonEmptySecret)),
          Effect.flatMap(users.ensure),
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
).pipe(Layer.provide(UserService.layer))
