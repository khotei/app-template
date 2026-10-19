import { HttpApi, OpenApi } from 'effect/http-api'

import { HealthApi } from '#api-contract/health.api'
import { SchemaErrors } from '#api-contract/security'
import { UsersApi } from '#api-contract/users.api'

/** `SchemaErrors` comes last: `HttpApi.middleware` reaches only the groups added before it. */
export class Api extends HttpApi.make('app-template')
  .add(HealthApi)
  .add(UsersApi)
  .middleware(SchemaErrors)
  .annotateMerge(OpenApi.annotations({ title: 'App Template API' })) {}

export * from '#api-contract/errors'
export * from '#api-contract/health.api'
export * as limits from '#api-contract/limits'
export * from '#api-contract/schemas'
export * from '#api-contract/security'
export * from '#api-contract/users.api'
