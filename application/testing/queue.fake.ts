import { Effect, Layer } from 'effect'

import { QueueClient } from '@app-template/queue'

export interface SentJob {
  readonly queue: string
  readonly jobId: string
  readonly job: unknown
}

/** The memory queue, recording every job sent to it. */
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
  ).pipe(Layer.provide(QueueClient.layerMemory))
  return { sent, layer }
}
