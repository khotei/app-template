import { Array as Arr, Effect, Layer, Ref } from 'effect'

import { JobSender } from '#kernel/job/job.sender'

/** A job the recording sender took, under its definition's name. */
export interface SentJob {
  readonly queue: string
  readonly job: unknown
}

/**
 * A `JobSender` that keeps each job in `sent`, in order, once the step `send` answers ran: a job
 * whose step never ran stays out.
 */
export function recordJobs() {
  const sent = Ref.makeUnsafe<ReadonlyArray<SentJob>>([])
  const layer = Layer.succeed(
    JobSender,
    JobSender.of({
      send: (definition, job) =>
        Effect.succeed(Ref.update(sent, Arr.append({ queue: definition.name, job }))),
    }),
  )
  return { sent: Ref.get(sent), layer }
}
