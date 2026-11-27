import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

import {
  type IdentityClaims,
  IdentityUnknownError,
} from '@app-template/application/identity/contract'

/** The key under which `IdentityMiddleware` provides the request's claims to the handlers. */
export class Identity extends Context.Service<Identity, IdentityClaims>()(
  '@app-template/application/http-api/Identity',
) {}

export class IdentityMiddleware extends HttpApiMiddleware.Service<
  IdentityMiddleware,
  { provides: Identity }
>()('@app-template/application/http-api/IdentityMiddleware', {
  security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
  error: IdentityUnknownError,
}) {}
