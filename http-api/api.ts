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
