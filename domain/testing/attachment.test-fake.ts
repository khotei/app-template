import {
  Array as Arr,
  Context,
  Effect,
  flow,
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
  AttachmentBucket,
  AttachmentRepository,
  type AttachmentWhere,
} from '#domain/attachment/attachment.port'
import { matches } from '#domain/testing/rows.test-util'

/** The rows `AttachmentRepositoryTest` keeps, by id, for a test to arrange or read. */
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

export const AttachmentRepositoryTest = Layer.effect(
  AttachmentRepository,
  Effect.map(AttachmentRows, (rows) =>
    AttachmentRepository.of({
      insert: (attachment) => Ref.update(rows, HashMap.set(attachment.id, attachment)),
      update: (set, where) =>
        Ref.modify(rows, (map) =>
          pipe(
            map,
            HashMap.filter(holdsWhere(where)),
            HashMap.map((attachment) => new Attachment({ ...attachment, ...set })),
            (written) => [HashMap.toValues(written), HashMap.union(map, written)] as const,
          ),
        ),
      selectOne: (where) =>
        Effect.map(Ref.get(rows), flow(HashMap.toValues, Arr.findFirst(matches(where)))),
      selectMany: (where) =>
        Ref.get(rows).pipe(
          Effect.map(HashMap.filter(holdsWhere(where))),
          Effect.map((found) => Arr.map(where.id, (id) => HashMap.get(found, id))),
          Effect.map(Arr.getSomes),
        ),
      deleteByIds: (ids) => Ref.update(rows, HashMap.removeMany(ids)),
    }),
  ),
)

/** The bytes `AttachmentBucketTest` holds, by id, for a test to read. */
export class AttachmentBucketObjects extends Context.Service<
  AttachmentBucketObjects,
  Ref.Ref<HashMap.HashMap<AttachmentId, Uint8Array>>
>()('@app-template/domain/testing/AttachmentBucketObjects') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<AttachmentId, Uint8Array>()))
}

/** The attachment bucket over a map; `keep` is a no-op, since nothing here expires. */
export const AttachmentBucketTest = Layer.effect(
  AttachmentBucket,
  Effect.map(AttachmentBucketObjects, (objects) => {
    const select = (id: AttachmentId) => Effect.map(Ref.get(objects), HashMap.get(id))
    return AttachmentBucket.of({
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
).pipe(Layer.provideMerge(AttachmentBucketObjects.layer))
