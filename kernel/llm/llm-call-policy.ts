import { Duration, Effect, Schedule } from 'effect'
import type { AiError, Response } from 'effect/ai'

import { LlmError } from '#kernel/llm/llm.error'

const isFinished = ({ finishReason }: { readonly finishReason: Response.FinishReason }) =>
  finishReason === 'stop'

const toUnfinishedError = ({ finishReason }: { readonly finishReason: Response.FinishReason }) =>
  new LlmError({ cause: `the model stopped with finish reason ${finishReason}` })

const toLlmError = ({ message }: AiError.AiError) => new LlmError({ cause: message })

const retryAfterOf = ({ retryAfter }: AiError.AiError) => retryAfter ?? Duration.zero

/** A `retryAfter` over 30 s, such as a daily token limit's, would outlast the job. */
const isWorthRetrying = (error: AiError.AiError) =>
  error.isRetryable && Duration.isLessThanOrEqualTo(retryAfterOf(error), Duration.seconds(30))

/** 1, 2 … s apart, each wait at least the provider's `retryAfter`. */
const retrySchedule = Schedule.exponential('1 second').pipe(
  Schedule.setInputType<AiError.AiError>(),
  Schedule.modifyDelay(({ input, duration }) =>
    Effect.succeed(Duration.max(duration, retryAfterOf(input))),
  ),
)

/**
 * `request` asked again while the provider marks its failure retryable, then its failure, or an
 * answer the language model did not finish, as an `LlmError`. Checked after the call's retries, an unfinished
 * answer is not asked again: resent with the same prompt and limits, it would most likely end
 * the same way.
 */
export const askModel = <A extends { readonly finishReason: Response.FinishReason }>(
  request: Effect.Effect<A, AiError.AiError>,
): Effect.Effect<A, LlmError> =>
  request.pipe(
    Effect.retry({ times: 2, while: isWorthRetrying, schedule: retrySchedule }),
    Effect.mapError(toLlmError),
    Effect.filterOrFail(isFinished, toUnfinishedError),
  )
