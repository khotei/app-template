import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import { User } from '#api-contract/schemas'

/** Has no `Auth`: `ensure` reads the cookie itself and answers with a user whatever it carries. */
export class UsersApi extends HttpApiGroup.make('users').add(
  HttpApiEndpoint.post('ensure', '/users', { success: User.pipe(HttpApiSchema.status(201)) }),
) {}
