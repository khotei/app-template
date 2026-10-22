import { Effect, Layer } from 'effect'

import { QueueClient } from '@app-template/queue'

export interface SentJob {
  readonly queue: string
  readonly jobId: string
  readonly job: unknown
}

/** Wraps the `QueueClient` beneath it, recording every job sent through it. */
export const recordQueue = () => {
  const sent: Array<SentJob> = []
  const layer = Layer.effect(
    QueueClient,
    Effect.map(QueueClient, (inner) =>
      QueueClient.of({
        ...inner,
        send: (definition, job) =>
          Effect.andThen(
            Effect.sync(() =>
              sent.push({ queue: definition.name, jobId: definition.jobId(job), job }),
            ),
            inner.send(definition, job),
          ),
      }),
    ),
  )
  return { sent, layer }
}
