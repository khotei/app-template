import { Layer } from 'effect'
import { PersistedQueue } from 'effect/persistence'

import { layerPersisted, type QueueClient } from '#queue/queue'

/** A process-local, volatile queue for tests and single-process development. */
export const QueueClientMemory: Layer.Layer<QueueClient> = layerPersisted.pipe(
  Layer.provide(PersistedQueue.layerStoreMemory),
)
