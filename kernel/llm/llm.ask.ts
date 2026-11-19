import { Duration, Effect, Schedule } from 'effect'
import type { AiError, Response } from 'effect/ai'

/** How a module names the two final failures of a model call; each takes operator detail. */
export interface ModelErrors<E> {
  /** The model declined to answer. */
  readonly refused: (cause: string) => E
  /** No answer came, and no further request would bring one. */
  readonly failed: (cause: string) => E
}

const isFinished = ({ finishReason }: { readonly finishReason: Response.FinishReason }) =>
  finishReason === 'stop'

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
 * answer the model did not finish, as one of the module's `errors`. Checked after the retries,
 * an unfinished answer is not asked again: resent with the same prompt and limits, it would most
 * likely end the same way.
 */
export const askModel =
  <E>({ refused, failed }: ModelErrors<E>) =>
  <A extends { readonly finishReason: Response.FinishReason }>(
    request: Effect.Effect<A, AiError.AiError>,
  ): Effect.Effect<A, E> =>
    request.pipe(
      Effect.retry({ times: 2, while: isWorthRetrying, schedule: retrySchedule }),
      Effect.mapError((error) => failed(error.message)),
      Effect.filterOrFail(isFinished, ({ finishReason }) => {
        const cause = `the model stopped with finish reason ${finishReason}`
        return finishReason === 'content-filter' ? refused(cause) : failed(cause)
      }),
    )
