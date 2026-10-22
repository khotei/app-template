import { Effect, Layer, Option, Stream } from 'effect'
import { Base64 } from 'effect/encoding'
import { KeyValueStore } from 'effect/persistence'

import {
  type AttachmentId,
  type AttachmentMeta,
  AttachmentStore,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'

import { createBlobs, createCollection } from '#infrastructure/kv/kv-collection'

const bytesKey = (id: AttachmentId) => `${id}/bytes`
const mediaTypeKey = (id: AttachmentId) => `${id}/media-type`

const toDataUrl = ({ bytes, mediaType }: { bytes: Uint8Array; mediaType: MediaType }) =>
  new URL(`data:${mediaType};base64,${Base64.encode(bytes)}`)

export const AttachmentStoreKv = Layer.effect(
  AttachmentStore,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const blobs = createBlobs(store, { prefix: 'attachments/' })
    const mediaTypes = createCollection(store, { prefix: 'attachments/', schema: MediaType })

    const insert = Effect.fn('AttachmentStore.insert')(function* <E>(
      id: AttachmentId,
      content: Stream.Stream<Uint8Array, E>,
      meta: AttachmentMeta,
    ) {
      const bytes = yield* Stream.mkUint8Array(content)

      yield* mediaTypes.set(mediaTypeKey(id), meta.mediaType)
      yield* blobs.set(bytesKey(id), bytes)
      return FileSize.make(bytes.length)
    })

    const url = Effect.fn('AttachmentStore.url')(function* (id: AttachmentId) {
      const bytes = yield* blobs.get(bytesKey(id))
      const mediaType = yield* mediaTypes.get(mediaTypeKey(id))

      return Option.map(Option.all({ bytes, mediaType }), toDataUrl)
    })

    const remove = Effect.fn('AttachmentStore.delete')(function* (id: AttachmentId) {
      yield* blobs.delete(bytesKey(id))
      yield* mediaTypes.delete(mediaTypeKey(id))
    })

    return AttachmentStore.of({
      insert,
      select: Effect.fn('AttachmentStore.select')((id: AttachmentId) => blobs.get(bytesKey(id))),
      url,
      keep: Effect.fn('AttachmentStore.keep')((_id: AttachmentId) => Effect.void),
      delete: remove,
    })
  }),
)
