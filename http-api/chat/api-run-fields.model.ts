import { Schema } from 'effect'

import { ChatId, RunId } from '#http-api/shared/ids'

export const RunStatus = Schema.Literals(['queued', 'preparing', 'generating', 'done', 'failed'])
export type RunStatus = typeof RunStatus.Type

export const RunFailureReason = Schema.Literals(['ReplyFailed', 'ReplyRefused'])
export type RunFailureReason = typeof RunFailureReason.Type

/** Carries the failure's user-facing sentence, never its cause. */
export const ApiRunFailure = Schema.Struct({
  reason: RunFailureReason,
  message: Schema.String,
})
export type ApiRunFailure = typeof ApiRunFailure.Type

/** A Run's own fields, as a message carries its Run. */
export const ApiRunFields = Schema.Struct({
  id: RunId,
  chatId: ChatId,
  status: RunStatus,
  failure: Schema.OptionFromNullOr(ApiRunFailure),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
})
export type ApiRunFields = typeof ApiRunFields.Type
