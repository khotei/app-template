import { Context, Effect, Layer, Option, Stream } from 'effect'

import { type AttachmentId, AttachmentStore, FileSize } from '@app-template/domain/attachment'

/** The bytes `AttachmentStoreMemory` holds, by id, for a test to read. */
export class AttachmentObjects extends Context.Service<
  AttachmentObjects,
  Map<AttachmentId, Uint8Array>
>()('@app-template/application/attachment/AttachmentObjects') {}

/** The attachment store over a map; `keep` is a no-op, since nothing here expires. */
export const AttachmentStoreMemory = Layer.effect(
  AttachmentStore,
  Effect.map(AttachmentObjects, (objects) => {
    const select = (id: AttachmentId) => Effect.sync(() => Option.fromUndefinedOr(objects.get(id)))
    return AttachmentStore.of({
      insert: (id, content) =>
        Effect.map(Stream.runCollect(content), (chunks) => {
          const bytes = new Uint8Array(Buffer.concat(chunks))
          objects.set(id, bytes)
          return FileSize.make(bytes.length)
        }),
      select,
      url: (id) => Effect.map(select(id), Option.as(new URL(`memory:attachments/${id}`))),
      keep: () => Effect.void,
      delete: (id) =>
        Effect.sync(() => {
          objects.delete(id)
        }),
    })
  }),
).pipe(Layer.provideMerge(Layer.sync(AttachmentObjects, () => new Map())))
