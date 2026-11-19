import { Duration, Effect, Schedule } from 'effect'
import type { AiError, Response } from 'effect/ai'

import {
  type AssistantError,
  AssistantFailedError,
  AssistantRefusedError,
} from '#chat/domain/assistant.error'

const isFinished = ({ finishReason }: { readonly finishReason: Response.FinishReason }) =>
  finishReason === 'stop'

function toUnfinishedError({ finishReason }: { readonly finishReason: Response.FinishReason }) {
  const cause = `the model stopped with finish reason ${finishReason}`
  return finishReason === 'content-filter'
    ? new AssistantRefusedError({ cause })
    : new AssistantFailedError({ cause })
}

export const toFailedError = (error: { readonly message: string }) =>
  new AssistantFailedError({ cause: error.message })

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
 * answer the model did not finish, as an `AssistantError`. Checked after the retries, an
 * unfinished answer is not asked again: resent with the same prompt and limits, it would most
 * likely end the same way.
 */
export const askModel = <A extends { readonly finishReason: Response.FinishReason }>(
  request: Effect.Effect<A, AiError.AiError>,
): Effect.Effect<A, AssistantError> =>
  request.pipe(
    Effect.retry({ times: 2, while: isWorthRetrying, schedule: retrySchedule }),
    Effect.mapError(toFailedError),
    Effect.filterOrFail(isFinished, toUnfinishedError),
  )
