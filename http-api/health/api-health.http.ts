import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

export class HealthHttp extends HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('get', '/health', {
    success: Schema.Struct({ status: Schema.Literal('ok') }),
  }),
) {}
