import type { Duration, Effect, Schema } from 'effect'

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

export const buildAttemptInfo = (receiveCount: number, maxAttempts: number): AttemptInfo => ({
  attempt: receiveCount,
  maxAttempts,
  isLastAttempt: receiveCount >= maxAttempts,
})
