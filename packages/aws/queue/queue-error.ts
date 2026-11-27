import { Data } from 'effect'

export class QueueError extends Data.TaggedError('QueueError')<{ readonly cause: unknown }> {}
