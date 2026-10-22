import { type Duration, Effect, Layer } from 'effect'

import { buildResourceName, provision, type Resources } from '@app-template/aws'
import { AwsClientsMiniStack } from '@app-template/testing'

import { encodeBody, QueueClient } from '#queue/queue'
import { QueueTransport } from '#queue/queue.transport'

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

export interface QueueClientMiniStackOptions {
  readonly resources: Resources
  readonly lockExpiration: Duration.Input
  readonly lockRefreshInterval: Duration.Input
}

/**
 * `QueueClient` and its SQS transport on the test file's MiniStack, with `resources` provisioned
 * under `stage`.
 */
export const QueueClientMiniStack = (
  stage: string,
  { resources, lockExpiration, lockRefreshInterval }: QueueClientMiniStackOptions,
) =>
  QueueClient.layer({
    queueName: (name) => buildResourceName(stage, name),
    lockExpiration,
    lockRefreshInterval,
  }).pipe(
    Layer.provideMerge(QueueTransport.layerSqs),
    Layer.provide(Layer.effectDiscard(Effect.orDie(provision(resources, stage)))),
    Layer.provide(AwsClientsMiniStack),
  )
