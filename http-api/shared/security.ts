import { Context, Schema } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

import { RequestInvalidError } from '#http-api/shared/errors'
import type { UserId } from '#http-api/shared/ids'

export class SchemaErrors extends HttpApiMiddleware.Service<SchemaErrors>()(
  '@app-template/http-api/shared/SchemaErrors',
  { error: RequestInvalidError },
) {}

export class UserUnknownError extends Schema.TaggedError<UserUnknownError>()(
  'UserUnknownError',
  {},
  { httpApiStatus: 401 },
) {}

export class CurrentUser extends Context.Service<CurrentUser, { readonly id: UserId }>()(
  '@app-template/http-api/shared/CurrentUser',
) {}

export class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>()(
  '@app-template/http-api/shared/Auth',
  {
    security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
    error: UserUnknownError,
  },
) {}
