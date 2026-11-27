import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import { ApiUser } from '#http-api/api-user.model'

/** Has no `Auth`: `recognise` reads the cookie itself and responds with a user whatever it holds. */
export class UserHttp extends HttpApiGroup.make('users').add(
  HttpApiEndpoint.post('recognise', '/users', { success: ApiUser.pipe(HttpApiSchema.status(201)) }),
) {}
