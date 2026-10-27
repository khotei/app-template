import {
  Array as Arr,
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  Predicate,
  pipe,
  Ref,
  Stream,
  Struct,
} from 'effect'

import type { AttachmentId } from '#domain/attachment/attachment.id'
import { Attachment, FileSize } from '#domain/attachment/attachment.model'
import {
  AttachmentRepository,
  AttachmentStore,
  type AttachmentWhere,
} from '#domain/attachment/attachment.port'
import { matches } from '#domain/testing/rows'

/** The rows `AttachmentRepositoryMemory` keeps, by id, for a test to arrange or read. */
export class AttachmentRows extends Context.Service<
  AttachmentRows,
  Ref.Ref<HashMap.HashMap<AttachmentId, Attachment>>
>()('@app-template/domain/testing/AttachmentRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<AttachmentId, Attachment>()))
}

const holdsWhere = (where: AttachmentWhere) =>
  Predicate.and(
    (attachment: Attachment) => Arr.contains(where.id, attachment.id),
    matches(Struct.omit(where, ['id'])),
  )

export const AttachmentRepositoryMemory = Layer.effect(
  AttachmentRepository,
  Effect.map(AttachmentRows, (rows) =>
    AttachmentRepository.of({
      insert: (attachment) => Ref.update(rows, HashMap.set(attachment.id, attachment)),
      update: (set, where) =>
        Ref.modify(rows, (map) => {
          const written = pipe(
            map,
            HashMap.filter(holdsWhere(where)),
            HashMap.map((attachment) => new Attachment({ ...attachment, ...set })),
          )
          return [HashMap.toValues(written), HashMap.union(map, written)]
        }),
      selectById: (id) => Effect.map(Ref.get(rows), HashMap.get(id)),
      selectByIds: (ids) =>
        Effect.map(Ref.get(rows), (map) =>
          Arr.getSomes(Arr.map(ids, (id) => HashMap.get(map, id))),
        ),
      deleteByIds: (ids) => Ref.update(rows, HashMap.removeMany(ids)),
    }),
  ),
)

/** The bytes `AttachmentStoreMemory` holds, by id, for a test to read. */
export class AttachmentObjects extends Context.Service<
  AttachmentObjects,
  Ref.Ref<HashMap.HashMap<AttachmentId, Uint8Array>>
>()('@app-template/domain/testing/AttachmentObjects') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<AttachmentId, Uint8Array>()))
}

/** The attachment store over a map; `keep` is a no-op, since nothing here expires. */
export const AttachmentStoreMemory = Layer.effect(
  AttachmentStore,
  Effect.map(AttachmentObjects, (objects) => {
    const select = (id: AttachmentId) => Effect.map(Ref.get(objects), HashMap.get(id))
    return AttachmentStore.of({
      insert: (id, content) =>
        Effect.gen(function* () {
          const bytes = yield* Stream.mkUint8Array(content)
          yield* Ref.update(objects, HashMap.set<AttachmentId, Uint8Array>(id, bytes))
          return FileSize.make(bytes.length)
        }),
      select,
      url: (id) => Effect.map(select(id), Option.as(new URL(`memory:attachments/${id}`))),
      keep: () => Effect.void,
      delete: (id) => Ref.update(objects, HashMap.remove(id)),
    })
  }),
).pipe(Layer.provideMerge(AttachmentObjects.layer))
