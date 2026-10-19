import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from 'effect/http-api'

import { type UserId, UserUnknownError } from '@app-template/domain/user'

import { RequestInvalidError } from '#http-api/shared/errors'

export class CurrentUser extends Context.Service<CurrentUser, { readonly id: UserId }>()(
  '@app-template/http-api/shared/CurrentUser',
) {}

export class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>()(
  '@app-template/http-api/shared/Auth',
  {
    security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
    error: UserUnknownError.pipe(HttpApiSchema.status(401)),
  },
) {}

export class SchemaErrors extends HttpApiMiddleware.Service<SchemaErrors>()(
  '@app-template/http-api/shared/SchemaErrors',
  { error: RequestInvalidError },
) {}
