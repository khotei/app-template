import { Array as Arr, Layer, Ref } from 'effect'

import { JobSender } from '#kernel/job/job.sender'

/** A job the recording sender took, under its definition's name. */
export interface SentJob {
  readonly queue: string
  readonly job: unknown
}

/** A `JobSender` that keeps each job it sends in `sent`, in order. */
export function recordJobs() {
  const sent = Ref.makeUnsafe<ReadonlyArray<SentJob>>([])
  const layer = Layer.succeed(
    JobSender,
    JobSender.of({
      send: (definition, job) => Ref.update(sent, Arr.append({ queue: definition.name, job })),
    }),
  )
  return { sent: Ref.get(sent), layer }
}
