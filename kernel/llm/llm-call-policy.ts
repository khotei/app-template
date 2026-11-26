import { Duration, Effect, Schedule } from 'effect'
import type { AiError, Response } from 'effect/ai'

import { LlmError } from '#kernel/llm/llm.error'

/** What `askModel` reads of an answer: how it ended and what its output counted. */
type Answer = {
  readonly finishReason: Response.FinishReason
  readonly usage: Response.Usage
}

const isFinished = ({ finishReason }: Answer) => finishReason === 'stop'

/**
 * Which limit cut an answer of finish reason `length`, in the provider's words. The provider's
 * package maps both to `length` and keeps neither, so it is read from the output's tokens: an
 * answer cut at the request's `max_tokens` counts that many, one cut by the window fewer.
 */
const lengthLimitOf = (outputTokens: number, maxTokens: number) =>
  outputTokens >= maxTokens ? 'max_tokens' : 'model_context_window_exceeded'

const toUnfinishedError =
  (maxTokens: number) =>
  ({ finishReason, usage }: Answer) => {
    const outputTokens = usage.outputTokens.total ?? 0
    const limit =
      finishReason === 'length'
        ? `, at ${lengthLimitOf(outputTokens, maxTokens)} after ${outputTokens} output tokens`
        : ''

    return new LlmError({ cause: `the model stopped with finish reason ${finishReason}${limit}` })
  }

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
 * `request`, sent with `maxTokens` as its output's limit, asked again while the provider marks
 * its failure retryable, then its failure, or an answer the language model did not finish, as an
 * `LlmError`; one cut for its length names the limit that cut it. Checked after the call's
 * retries, an unfinished answer is not asked again: resent with the same prompt and limits, it
 * would most likely end the same way.
 */
export const askModel =
  ({ maxTokens }: { readonly maxTokens: number }) =>
  <A extends Answer>(request: Effect.Effect<A, AiError.AiError>): Effect.Effect<A, LlmError> =>
    request.pipe(
      Effect.retry({ times: 2, while: isWorthRetrying, schedule: retrySchedule }),
      Effect.mapError(toLlmError),
      Effect.filterOrFail(isFinished, toUnfinishedError(maxTokens)),
    )
