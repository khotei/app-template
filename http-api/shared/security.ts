import { HttpApiMiddleware } from 'effect/http-api'

import { RequestInvalidError } from '#http-api/shared/errors'

export class SchemaErrors extends HttpApiMiddleware.Service<SchemaErrors>()(
  '@app-template/http-api/shared/SchemaErrors',
  { error: RequestInvalidError },
) {}
