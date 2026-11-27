import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import { ApiIdentity } from '#http-api/api-identity.model'

/**
 * Has no `IdentityMiddleware`: `recognise` reads the cookie itself and responds with an identity
 * whatever it holds.
 */
export class IdentityHttp extends HttpApiGroup.make('identity').add(
  HttpApiEndpoint.post('recognise', '/identity', {
    success: ApiIdentity.pipe(HttpApiSchema.status(201)),
  }),
) {}
