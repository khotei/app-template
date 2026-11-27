import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

import { type Identity, IdentityUnknownError } from '@app-template/application/identity/contract'

/** The `Identity` of the request's credential, which `Auth` provides to the handlers behind it. */
export class RequestIdentity extends Context.Service<RequestIdentity, Identity>()(
  '@app-template/application/http-api/RequestIdentity',
) {}

export class Auth extends HttpApiMiddleware.Service<Auth, { provides: RequestIdentity }>()(
  '@app-template/application/http-api/Auth',
  {
    security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
    error: IdentityUnknownError,
  },
) {}
