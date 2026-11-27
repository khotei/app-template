import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import { ApiIdentity } from '#http-api/identity/api-identity.model'
import { IdentityMiddleware } from '#http-api/identity/identity.middleware'

/**
 * `IdentityMiddleware` guards `get` alone: `recognise` reads the cookie itself, so it can answer
 * an unknown or missing secret with a new user, where the middleware would refuse it.
 */
export class IdentityHttp extends HttpApiGroup.make('identity').add(
  HttpApiEndpoint.post('recognise', '/identity', {
    success: ApiIdentity.pipe(HttpApiSchema.status(201)),
  }),
  HttpApiEndpoint.get('get', '/identity', { success: ApiIdentity }).middleware(IdentityMiddleware),
) {}
