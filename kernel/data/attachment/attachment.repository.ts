import { eq, inArray, isNull } from 'drizzle-orm'
import {
  Array as Arr,
  Context,
  Effect,
  Filter,
  identity,
  Layer,
  type Option,
  pipe,
  UndefinedOr,
} from 'effect'

import { buildSet, buildWhere, orDieOnNoRows, orDieWithSqlError } from '@app-template/packages/db'

import type {
  AttachmentEntity,
  AttachmentEntityInsert,
  AttachmentEntitySet,
  AttachmentEntityWhere,
} from '#kernel/data/attachment/attachment.entity'
import { attachments } from '#kernel/data/attachment/attachment.table'
import { Db } from '#kernel/data/db.client'

const encodeSet = buildSet<AttachmentEntitySet, typeof attachments>({
  messageId: identity,
  chatId: identity,
})

const encodeWhere = buildWhere<AttachmentEntityWhere>({
  id: (id) => inArray(attachments.id, Arr.ensure(id)),
  userId: UndefinedOr.map((userId) => eq(attachments.userId, userId)),
  messageId: UndefinedOr.map((messageId) =>
    messageId === null ? isNull(attachments.messageId) : eq(attachments.messageId, messageId),
  ),
})

/** The rows in the order of `ids`, one id or a list. */
const inOrderOf =
  (ids: AttachmentEntityWhere['id']) =>
  (found: ReadonlyArray<AttachmentEntity>): ReadonlyArray<AttachmentEntity> =>
    pipe(
      Arr.ensure(ids),
      Arr.filterMap(
        Filter.fromPredicateOption((id: string) => Arr.findFirst(found, (each) => each.id === id)),
      ),
    )

export class AttachmentRepository extends Context.Service<
  AttachmentRepository,
  {
    readonly insert: (attachment: typeof AttachmentEntityInsert.Type) => Effect.Effect<void>
    /** Writes `set` where `where` holds, in one statement; dies when it writes nothing. */
    readonly update: (set: AttachmentEntitySet, where: AttachmentEntityWhere) => Effect.Effect<void>
    /** The first row `selectMany` reads. */
    readonly selectOne: (
      where: AttachmentEntityWhere,
    ) => Effect.Effect<Option.Option<AttachmentEntity>>
    /**
     * Rows where `where` holds, in the order of `where.id`, unknown ids skipped. With
     * `forUpdate`, holds the rows it reads until the transaction ends.
     */
    readonly selectMany: (
      where: AttachmentEntityWhere,
      options?: { readonly forUpdate?: boolean },
    ) => Effect.Effect<ReadonlyArray<AttachmentEntity>>
    /** Deletes the rows where `where` holds, in one statement; dies when it deletes nothing. */
    readonly delete: (where: AttachmentEntityWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/attachment/AttachmentRepository', {
  make: Db.useSync((db) => {
    const selectMany = Effect.fn('AttachmentRepository.selectMany')(function* (
      where: AttachmentEntityWhere,
      options?: { readonly forUpdate?: boolean },
    ) {
      const query = db.select().from(attachments).where(encodeWhere(where)).$dynamic()
      const rows = yield* options?.forUpdate ? query.for('update') : query
      return inOrderOf(where.id)(rows)
    }, orDieWithSqlError)

    return {
      insert: Effect.fn('AttachmentRepository.insert')(
        (attachment: typeof AttachmentEntityInsert.Type) =>
          db.insert(attachments).values(attachment).pipe(Effect.asVoid),
        orDieWithSqlError,
      ),
      update: Effect.fn('AttachmentRepository.update')(
        (set: AttachmentEntitySet, where: AttachmentEntityWhere) =>
          db
            .update(attachments)
            .set(encodeSet(set))
            .where(encodeWhere(where))
            .returning({ id: attachments.id })
            .pipe(orDieOnNoRows('no attachment was updated')),
        orDieWithSqlError,
      ),
      selectOne: (where: AttachmentEntityWhere) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
      delete: Effect.fn('AttachmentRepository.delete')(
        (where: AttachmentEntityWhere) =>
          db
            .delete(attachments)
            .where(encodeWhere(where))
            .returning({ id: attachments.id })
            .pipe(orDieOnNoRows('no attachment was deleted')),
        orDieWithSqlError,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
