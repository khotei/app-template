import { Effect, Layer } from 'effect'

import { buildResourceName, provision, resources } from '@app-template/aws'
import { QueueClient, QueueTransport } from '@app-template/queue'
import { AwsClientsMiniStack, buildStage } from '@app-template/testing'

const stage = buildStage()

/** The inventory's queues, provisioned under a fresh stage on the test file's MiniStack. */
export const QueueClientMiniStack = QueueClient.layer({
  queueName: (name) => buildResourceName(stage, name),
  lockExpiration: '30 seconds',
  lockRefreshInterval: '10 seconds',
}).pipe(
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide(Layer.effectDiscard(Effect.orDie(provision(resources, stage)))),
  Layer.provide(AwsClientsMiniStack),
)
