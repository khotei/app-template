import { HttpApi } from 'effect/http-api'

import { AttachmentHttp } from '#http-api/attachment/api-attachment.http'
import { ChatHttp } from '#http-api/chat/api-chat.http'
import { HealthHttp } from '#http-api/health/api-health.http'
import { SchemaErrors } from '#http-api/shared/security'
import { UserHttp } from '#http-api/user/api-user.http'

/** `SchemaErrors` comes last: `HttpApi.middleware` reaches only the groups added before it. */
export class Api extends HttpApi.make('app-template')
  .add(HealthHttp)
  .add(UserHttp)
  .add(ChatHttp)
  .add(AttachmentHttp)
  .middleware(SchemaErrors)
  .annotate(HttpApi.ParseOptions, { errors: 'all' }) {}
