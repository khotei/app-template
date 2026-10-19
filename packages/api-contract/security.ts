import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

import { RequestInvalid, UserUnknown } from '#api-contract/errors'
import type { UserId } from '#api-contract/schemas'

export class CurrentUser extends Context.Service<CurrentUser, { readonly id: UserId }>()(
  '@app-template/api-contract/CurrentUser',
) {}

export class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>()(
  '@app-template/api-contract/Auth',
  {
    security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
    error: UserUnknown,
  },
) {}

export class SchemaErrors extends HttpApiMiddleware.Service<SchemaErrors>()(
  '@app-template/api-contract/SchemaErrors',
  { error: RequestInvalid },
) {}
