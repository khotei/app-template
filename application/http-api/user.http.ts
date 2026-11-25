import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import { User } from '@app-template/application/user/contract'

const ApiUser = User.json.annotate({ identifier: 'ApiUser' })

/** Has no `Auth`: `recognise` reads the cookie itself and responds with a user whatever it holds. */
export class UserHttp extends HttpApiGroup.make('users').add(
  HttpApiEndpoint.post('recognise', '/users', { success: ApiUser.pipe(HttpApiSchema.status(201)) }),
) {}
