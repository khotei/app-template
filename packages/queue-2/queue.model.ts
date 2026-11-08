import { Array as Arr, type Duration, type Effect, type Schema, String as Str } from 'effect'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
  readonly maxAttempts: number
  /** How long a message waits after a failed `attempt`. */
  readonly retryDelay: (attempt: number) => Duration.Input
}

export interface AttemptInfo {
  /** 1-based. */
  readonly attempt: number
  readonly maxAttempts: number
  /** A failure of this attempt dead-letters the message instead of scheduling a retry. */
  readonly isLastAttempt: boolean
}

export type Handler<A, E, R> = (message: A, attempt: AttemptInfo) => Effect.Effect<void, E, R>

export function buildAttemptInfo(receiveCount: number, maxAttempts: number): AttemptInfo {
  return { attempt: receiveCount, maxAttempts, isLastAttempt: receiveCount >= maxAttempts }
}

/** The name of the queue an ARN names. */
export function buildQueueName(arn: string): string {
  return Arr.lastNonEmpty(Str.split(arn, ':'))
}
