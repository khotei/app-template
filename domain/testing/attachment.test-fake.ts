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
    (attachment: Attachment) => where.id === undefined || Arr.contains(where.id, attachment.id),
    matches(Struct.omit(where, ['id'])),
  )

/** The rows in the order of `ids`; without `ids`, as stored. */
const inOrderOf =
  (ids: ReadonlyArray<AttachmentId> | undefined) =>
  (found: HashMap.HashMap<AttachmentId, Attachment>): ReadonlyArray<Attachment> =>
    ids === undefined
      ? HashMap.toValues(found)
      : pipe(
          ids,
          Arr.map((id) => HashMap.get(found, id)),
          Arr.getSomes,
        )

export const AttachmentRepositoryTest = Layer.effect(
  AttachmentRepository,
  AttachmentRows.useSync((rows) =>
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
        Ref.get(rows).pipe(
          Effect.map(HashMap.get(where.id)),
          Effect.map(Option.filter(matches(Struct.omit(where, ['id'])))),
        ),
      selectMany: (where) =>
        Ref.get(rows).pipe(
          Effect.map(HashMap.filter(holdsWhere(where))),
          Effect.map(inOrderOf(where.id)),
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
      delete: (id) => Ref.update(objects, HashMap.remove(id)),
    })
  }),
).pipe(Layer.provideMerge(AttachmentBucketObjects.layer))
