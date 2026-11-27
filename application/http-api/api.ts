import { HttpApi } from 'effect/http-api'

import { ChatHttp } from '#http-api/chat/chat.http'
import { HealthHttp } from '#http-api/health/health.http'
import { IdentityHttp } from '#http-api/identity/identity.http'
import { IdentityMiddleware } from '#http-api/identity/identity.middleware'
import { SchemaErrors } from '#http-api/request/request.middleware'

/**
 * A middleware reaches only the groups added before it: a group whose every endpoint needs the
 * identity joins the first `add`; one that needs it on some endpoints puts
 * `.middleware(IdentityMiddleware)` on those.
 */
export class Api extends HttpApi.make('app-template')
  .add(ChatHttp)
  .middleware(IdentityMiddleware)
  .add(HealthHttp, IdentityHttp)
  .middleware(SchemaErrors)
  .annotate(HttpApi.ParseOptions, { errors: 'all' }) {}
