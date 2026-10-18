import { Effect, Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { type AttachmentId, AttachmentStore } from '@app-template/domain/attachment'

import { createBlobs } from '#infrastructure/kv/kv-collection'

const bytesKey = (id: AttachmentId) => `${id}/bytes`

export const AttachmentStoreKv = Layer.effect(
  AttachmentStore,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const blobs = createBlobs(store, { prefix: 'attachments/' })
    return AttachmentStore.of({
      insert: Effect.fn('AttachmentStore.insert')(function* (id, bytes) {
        yield* blobs.set(bytesKey(id), bytes)
      }),
      select: Effect.fn('AttachmentStore.select')(function* (id) {
        return yield* blobs.get(bytesKey(id))
      }),
      delete: Effect.fn('AttachmentStore.delete')(function* (id) {
        yield* blobs.delete(bytesKey(id))
      }),
    })
  }),
)
