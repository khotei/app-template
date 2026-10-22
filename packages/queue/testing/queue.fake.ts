import { Effect, Layer } from 'effect'

import { encodeBody, QueueClient } from '#queue/queue'

export interface SentJob {
  readonly queue: string
  readonly jobId: string
  readonly job: unknown
}

/**
 * A `QueueClient` that records each job `send` encodes and forwards nothing; `consume` dies.
 *
 * It encodes as the client does, so a job that would not reach a queue fails here too.
 */
export const recordQueue = () => {
  const sent: Array<SentJob> = []
  const layer = Layer.succeed(
    QueueClient,
    QueueClient.of({
      send: (definition, job) =>
        encodeBody(definition, job).pipe(
          Effect.andThen(
            Effect.sync(() => {
              sent.push({ queue: definition.name, jobId: definition.jobId(job), job })
            }),
          ),
        ),
      consume: () => Effect.die('the recording queue only sends'),
    }),
  )
  return { sent, layer }
}
