import { HttpApi, OpenApi } from 'effect/http-api'

import { HealthHttp } from '#http-api/health/health.http'
import { SchemaErrors } from '#http-api/shared/security'
import { UserHttp } from '#http-api/user/user.http'

/** `SchemaErrors` comes last: `HttpApi.middleware` reaches only the groups added before it. */
export class Api extends HttpApi.make('app-template')
  .add(HealthHttp)
  .add(UserHttp)
  .middleware(SchemaErrors)
  .annotateMerge(OpenApi.annotations({ title: 'App Template API' })) {}

export * from '#http-api/health/health.http'
export * from '#http-api/shared/errors'
export * as limits from '#http-api/shared/limits'
export * from '#http-api/shared/security'
export * from '#http-api/user/user.http'
