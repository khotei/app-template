import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from 'effect/http-api'

import { UserUnknownError } from '#contract/user.error'
import type { UserId } from '#contract/user.id'

export class CurrentUser extends Context.Service<CurrentUser, { readonly id: UserId }>()(
  '@app-template/identity-contract/CurrentUser',
) {}

export class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>()(
  '@app-template/identity-contract/Auth',
  {
    security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
    error: UserUnknownError.pipe(HttpApiSchema.status(401)),
  },
) {}
