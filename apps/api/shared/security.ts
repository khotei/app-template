import { Effect, Layer, Predicate, SchemaIssue } from 'effect'
import { type HttpApiError, HttpApiMiddleware } from 'effect/http-api'

import { UserService } from '@app-template/application/user'
import { Auth, CurrentUser, RequestInvalidError, SchemaErrors } from '@app-template/http-api'

export const AuthUserService = Layer.effect(
  Auth,
  Effect.map(UserService, (users) =>
    Auth.of({
      cookie: (httpEffect, { credential }) =>
        Effect.flatMap(users.authenticate(credential), (user) =>
          Effect.provideService(httpEffect, CurrentUser, { id: user.id }),
        ),
    }),
  ),
)

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
    issues: formatIssues(error.cause.issue).issues.map(({ path = [], message }) => ({
      path: path.map((segment) => {
        const key = Predicate.isObject(segment) ? segment.key : segment
        return Predicate.isNumber(key) ? key : String(key)
      }),
      message,
    })),
  })

export const SchemaErrorsRequestInvalid = HttpApiMiddleware.layerSchemaErrorTransform(
  SchemaErrors,
  (error) => Effect.fail(isRequestPart[error.kind] ? toRequestInvalidError(error) : error),
)
