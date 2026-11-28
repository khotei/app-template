import { Duration, Effect, Schedule } from 'effect'
import type { AiError, Response } from 'effect/ai'

import { LlmError } from '#kernel/llm/llm.model'

/** This app's policy for a call to a language model: its retries, its errors, its finish. */
export class LlmCall {
  private static readonly isFinished = ({
    finishReason,
  }: {
    readonly finishReason: Response.FinishReason
  }) => finishReason === 'stop'

  private static readonly toUnfinishedError = ({
    finishReason,
  }: {
    readonly finishReason: Response.FinishReason
  }) => new LlmError({ cause: `the model stopped with finish reason ${finishReason}` })

  private static readonly toLlmError = ({ message }: AiError.AiError) =>
    new LlmError({ cause: message })

  private static readonly retryAfterOf = ({ retryAfter }: AiError.AiError) =>
    retryAfter ?? Duration.zero

  /** A `retryAfter` over 30 s, such as a daily token limit's, would outlast the handling. */
  private static readonly isWorthRetrying = (error: AiError.AiError) =>
    error.isRetryable &&
    Duration.isLessThanOrEqualTo(LlmCall.retryAfterOf(error), Duration.seconds(30))

  /** 1, 2 … s apart, each wait at least the provider's `retryAfter`. */
  private static readonly retrySchedule = Schedule.exponential('1 second').pipe(
    Schedule.setInputType<AiError.AiError>(),
    Schedule.modifyDelay(({ input, duration }) =>
      Effect.succeed(Duration.max(duration, LlmCall.retryAfterOf(input))),
    ),
  )

  /** Past it a silent language model is given up: Anthropic SDK's own limit. */
  private static readonly answerLimit = Duration.minutes(10)

  private static readonly failSilent = () =>
    Effect.fail(new LlmError({ cause: 'the model kept silent for ten minutes' }))

  /**
   * `request` asked again while the provider marks its failure retryable, then its failure, or an
   * answer the language model did not finish, as an `LlmError`. Checked after the call's retries,
   * an unfinished answer is not asked again: resent with the same prompt and limits, it would most
   * likely end the same way. The whole call, its retries included, ends after ten minutes.
   */
  static readonly ask = <A extends { readonly finishReason: Response.FinishReason }>(
    request: Effect.Effect<A, AiError.AiError>,
  ): Effect.Effect<A, LlmError> =>
    request.pipe(
      Effect.retry({ times: 2, while: LlmCall.isWorthRetrying, schedule: LlmCall.retrySchedule }),
      Effect.mapError(LlmCall.toLlmError),
      Effect.timeoutOrElse({ duration: LlmCall.answerLimit, orElse: LlmCall.failSilent }),
      Effect.filterOrFail(LlmCall.isFinished, LlmCall.toUnfinishedError),
    )
}
