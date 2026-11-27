import { Array as Arr, Effect, Layer, Predicate, SchemaIssue } from 'effect'
import { type HttpApiError, HttpApiMiddleware } from 'effect/http-api'

import {
  Auth,
  RequestIdentity,
  RequestInvalidError,
  SchemaErrors,
} from '@app-template/application/http-api'
import { Identity, IdentityService } from '@app-template/application/identity'

export const AuthLayer = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const identityService = yield* IdentityService
    return Auth.of({
      cookie: (httpEffect, { credential }) =>
        Effect.provideServiceEffect(
          httpEffect,
          RequestIdentity,
          identityService
            .authenticate(credential)
            .pipe(Effect.map((user) => new Identity({ userId: user.id }))),
        ),
    })
  }),
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
    issues: Arr.map(formatIssues(error.cause.issue).issues, ({ path = [], message }) => ({
      path: Arr.map(path, (segment) => {
        const key = Predicate.isObject(segment) ? segment.key : segment
        return Predicate.isNumber(key) ? key : String(key)
      }),
      message,
    })),
  })

export const SchemaErrorsLayer = HttpApiMiddleware.layerSchemaErrorTransform(
  SchemaErrors,
  (error) => Effect.fail(isRequestPart[error.kind] ? toRequestInvalidError(error) : error),
)
