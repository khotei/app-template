import { Schema } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

import { type Identity, IdentityUnknownError } from '@app-template/application/identity/contract'

/** `path` mixes property names and array indices, as Standard Schema reports them. */
export const RequestIssue = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
  message: Schema.String,
})
export type RequestIssue = typeof RequestIssue.Type

export class RequestInvalidError extends Schema.TaggedError<RequestInvalidError>()(
  'RequestInvalidError',
  { issues: Schema.Array(RequestIssue) },
  { httpApiStatus: 400 },
) {}

export class Auth extends HttpApiMiddleware.Service<Auth, { provides: Identity }>()(
  '@app-template/application/http-api/Auth',
  {
    security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
    error: IdentityUnknownError,
  },
) {}

export class SchemaErrors extends HttpApiMiddleware.Service<SchemaErrors>()(
  '@app-template/application/http-api/SchemaErrors',
  { error: RequestInvalidError },
) {}
