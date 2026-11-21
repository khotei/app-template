import { HttpApi } from 'effect/http-api'

import { ChatHttp } from '#api/chat/chat.http'
import { HealthHttp } from '#api/health/health.http'
import { Auth, SchemaErrors } from '#api/shared/api-security'
import { UserHttp } from '#api/user/user.http'

/** A middleware reaches only the groups added before it: an authed group joins the first `add`. */
export class Api extends HttpApi.make('app-template')
  .add(ChatHttp)
  .middleware(Auth)
  .add(HealthHttp, UserHttp)
  .middleware(SchemaErrors)
  .annotate(HttpApi.ParseOptions, { errors: 'all' }) {}
