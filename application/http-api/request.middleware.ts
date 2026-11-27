import { HttpApiMiddleware } from 'effect/http-api'

import { RequestInvalidError } from '#http-api/api-request.model'

export class SchemaErrors extends HttpApiMiddleware.Service<SchemaErrors>()(
  '@app-template/application/http-api/SchemaErrors',
  { error: RequestInvalidError },
) {}
