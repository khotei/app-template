import { HttpApi } from 'effect/http-api'

import { Auth, SchemaErrors } from '#http-api/api-security'
import { ChatHttp } from '#http-api/chat.http'
import { HealthHttp } from '#http-api/health.http'
import { UserHttp } from '#http-api/user.http'

/** A middleware reaches only the groups added before it: an authed group joins the first `add`. */
export class Api extends HttpApi.make('app-template')
  .add(ChatHttp)
  .middleware(Auth)
  .add(HealthHttp, UserHttp)
  .middleware(SchemaErrors)
  .annotate(HttpApi.ParseOptions, { errors: 'all' }) {}
