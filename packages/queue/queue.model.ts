import { Array as Arr, Duration, type Effect, type Schema, String as Str } from 'effect'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
  readonly maxAttempts: number
  /** How long a message waits after a failed `attempt`. */
  readonly retryDelay: (attempt: number) => Duration.Input
}

/** 1, 2, 4, … seconds: a retry delay that backs off a failing handler. */
export function buildDoublingDelay(attempt: number): Duration.Duration {
  return Duration.seconds(2 ** (attempt - 1))
}

export interface AttemptInfo {
  /** The `jobs` row the message carries. */
  readonly jobId: string
  /** 1-based. */
  readonly attempt: number
  readonly maxAttempts: number
  /** A failure of this attempt dead-letters the message instead of scheduling a retry. */
  readonly isLastAttempt: boolean
}

export type Handler<A, E, R> = (message: A, attempt: AttemptInfo) => Effect.Effect<void, E, R>

export function buildAttemptInfo(
  jobId: string,
  { receiveCount, maxAttempts }: { readonly receiveCount: number; readonly maxAttempts: number },
): AttemptInfo {
  return { jobId, attempt: receiveCount, maxAttempts, isLastAttempt: receiveCount >= maxAttempts }
}

/** The name of the queue an ARN names. */
export function buildQueueName(arn: string): string {
  return Arr.lastNonEmpty(Str.split(arn, ':'))
}
