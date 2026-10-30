import { Array as Arr, Layer, Ref } from 'effect'

import { QueueSender } from '#queue/queue'

/** A job the recording sender took, under its definition's name and job id. */
export interface SentJob {
  readonly queue: string
  readonly jobId: string
  readonly job: unknown
}

/** A `QueueSender` that keeps each job sent in `sent`, in order. */
export const recordQueue = () => {
  const sent = Ref.makeUnsafe<ReadonlyArray<SentJob>>([])
  const layer = Layer.succeed(
    QueueSender,
    QueueSender.of({
      send: (definition, job) =>
        Ref.update(sent, Arr.append({ queue: definition.name, jobId: definition.jobId(job), job })),
    }),
  )
  return { sent: Ref.get(sent), layer }
}
