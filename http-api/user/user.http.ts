import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import { UserId } from '#http-api/shared/ids'

export const ApiUser = Schema.Struct({ id: UserId, createdAt: Schema.DateTimeUtc }).annotate({
  identifier: 'User',
})
export type ApiUser = typeof ApiUser.Type

/** Has no `Auth`: `ensure` reads the cookie itself and answers with a user whatever it carries. */
export class UserHttp extends HttpApiGroup.make('users').add(
  HttpApiEndpoint.post('ensure', '/users', { success: ApiUser.pipe(HttpApiSchema.status(201)) }),
) {}
