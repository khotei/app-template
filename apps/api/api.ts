import { HttpApi } from 'effect/http-api'

import { AttachmentHttp } from '#api/attachment/attachment.http'
import { ChatHttp } from '#api/chat/chat.http'
import { HealthHttp } from '#api/health/health.http'
import { SchemaErrors } from '#api/shared/security'
import { UserHttp } from '#api/user/user.http'

/** `SchemaErrors` comes last: `HttpApi.middleware` reaches only the groups added before it. */
export class Api extends HttpApi.make('app-template')
  .add(HealthHttp)
  .add(UserHttp)
  .add(ChatHttp)
  .add(AttachmentHttp)
  .middleware(SchemaErrors)
  .annotate(HttpApi.ParseOptions, { errors: 'all' }) {}
