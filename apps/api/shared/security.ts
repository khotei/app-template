import { Array as Arr, Context, Effect, Layer, Predicate, Schema, SchemaIssue } from 'effect'
import {
  type HttpApiError,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from 'effect/http-api'

import { type UserId, UserService, UserUnknownError } from '@app-template/application/identity'

/** `path` mixes property names and array indices, as Standard Schema reports them. */
export const RequestIssue = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
  message: Schema.String,
})
export type RequestIssue = typeof RequestIssue.Type

export class RequestInvalidError extends Schema.TaggedError<RequestInvalidError>()(
  'RequestInvalidError',
  { issues: Schema.Array(RequestIssue) },
) {}

export class CurrentUser extends Context.Service<CurrentUser, { readonly id: UserId }>()(
  '@app-template/apps/api/shared/CurrentUser',
) {}

export class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>()(
  '@app-template/apps/api/shared/Auth',
  {
    security: { cookie: HttpApiSecurity.apiKey({ key: 'user_secret', in: 'cookie' }) },
    error: UserUnknownError.pipe(HttpApiSchema.status(401)),
  },
) {
  static readonly layer = Layer.effect(
    this,
    UserService.useSync((users) =>
      this.of({
        cookie: (httpEffect, { credential }) =>
          Effect.provideServiceEffect(httpEffect, CurrentUser, users.authenticate(credential)),
      }),
    ),
  ).pipe(Layer.provide(UserService.layer))
}

/** Request parts become a `400`; a response that fails to encode stays the built-in `500`. */
const isRequestPart = {
  Params: true,
  Headers: true,
  Query: true,
  Payload: true,
  Body: false,
  ResponseHeaders: false,
} as const satisfies Record<HttpApiError.HttpApiSchemaError['kind'], boolean>

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

const toRequestInvalidError = (error: HttpApiError.HttpApiSchemaError) =>
  new RequestInvalidError({
    issues: Arr.map(formatIssues(error.cause.issue).issues, ({ path = [], message }) => ({
      path: Arr.map(path, (segment) => {
        const key = Predicate.isObject(segment) ? segment.key : segment
        return Predicate.isNumber(key) ? key : String(key)
      }),
      message,
    })),
  })

export class SchemaErrors extends HttpApiMiddleware.Service<SchemaErrors>()(
  '@app-template/apps/api/shared/SchemaErrors',
  { error: RequestInvalidError.pipe(HttpApiSchema.status(400)) },
) {
  static readonly layer = HttpApiMiddleware.layerSchemaErrorTransform(this, (error) =>
    Effect.fail(isRequestPart[error.kind] ? toRequestInvalidError(error) : error),
  )
}
