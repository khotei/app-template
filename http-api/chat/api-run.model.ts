import { Schema } from 'effect'

import { ApiMessageFields } from '#http-api/chat/api-message.model'
import { ApiRunFields } from '#http-api/chat/api-run-fields.model'

/** The work of answering `userMessage`; `assistantMessage` once it is done. Neither carries attachments. */
export const ApiRun = Schema.Struct({
  ...ApiRunFields.fields,
  userMessage: ApiMessageFields,
  assistantMessage: Schema.OptionFromNullOr(ApiMessageFields),
})
export type ApiRun = typeof ApiRun.Type
