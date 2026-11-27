import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

import { type Identity, IdentityUnknownError } from '@app-template/application/identity/contract'

/**
 * The `Identity` of the request's credential, which `IdentityMiddleware` provides to the handlers
 * behind it.
 */
export class RequestIdentity extends Context.Service<RequestIdentity, Identity>()(
  '@app-template/application/http-api/RequestIdentity',
) {}

export class IdentityMiddleware extends HttpApiMiddleware.Service<
  IdentityMiddleware,
  { provides: RequestIdentity }
>()('@app-template/application/http-api/IdentityMiddleware', {
  security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
  error: IdentityUnknownError,
}) {}
