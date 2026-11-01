import { Context, Effect, HashMap, Layer, Option, Ref, Stream } from 'effect'

import type { AttachmentId } from '#domain/attachment.id'
import { FileSize } from '#domain/attachment.model'
import { AttachmentBucket } from '#domain/attachment.port'

/** The bytes `AttachmentBucketTest` holds, by id, for a test to read. */
export class AttachmentBucketObjects extends Context.Service<
  AttachmentBucketObjects,
  Ref.Ref<HashMap.HashMap<AttachmentId, Uint8Array>>
>()('@app-template/chat/testing/AttachmentBucketObjects') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<AttachmentId, Uint8Array>()))
}

/** The attachment bucket over a map; `keep` is a no-op, since nothing here expires. */
export const AttachmentBucketTest = Layer.effect(
  AttachmentBucket,
  AttachmentBucketObjects.useSync((objects) => {
    const select = (id: AttachmentId) => Ref.get(objects).pipe(Effect.map(HashMap.get(id)))
    return AttachmentBucket.of({
      insert: (id, content) =>
        Effect.gen(function* () {
          const bytes = yield* Stream.mkUint8Array(content)
          yield* Ref.update(objects, HashMap.set<AttachmentId, Uint8Array>(id, bytes))
          return FileSize.make(bytes.length)
        }),
      select,
      url: (id) => select(id).pipe(Effect.map(Option.as(new URL(`memory:attachments/${id}`)))),
      keep: () => Effect.void,
      delete: (ids) => Ref.update(objects, HashMap.removeMany(ids)),
    })
  }),
).pipe(Layer.provideMerge(AttachmentBucketObjects.layer))
