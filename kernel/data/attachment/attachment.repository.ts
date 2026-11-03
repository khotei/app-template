import { eq, inArray } from 'drizzle-orm'
import { Array as Arr, Context, Effect, identity, Layer, type Option, UndefinedOr } from 'effect'

import {
  buildSet,
  buildWhere,
  eqOrIsNull,
  hasRowPer,
  orDieUnless,
  orDieWithSqlError,
} from '@app-template/packages/db'

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
  messageId: UndefinedOr.map(eqOrIsNull(attachments.messageId)),
})

export class AttachmentRepository extends Context.Service<
  AttachmentRepository,
  {
    readonly insert: (attachment: typeof AttachmentEntityInsert.Type) => Effect.Effect<void>
    /** Writes `set` where `where` holds, in one statement; dies when it misses a row `where.id` names. */
    readonly update: (set: AttachmentEntitySet, where: AttachmentEntityWhere) => Effect.Effect<void>
    /** The first row `selectMany` reads. */
    readonly selectOne: (
      where: AttachmentEntityWhere,
    ) => Effect.Effect<Option.Option<AttachmentEntity>>
    /** Rows where `where` holds, in creation order. */
    readonly selectMany: (
      where: AttachmentEntityWhere,
    ) => Effect.Effect<ReadonlyArray<AttachmentEntity>>
    /** Deletes the rows where `where` holds, in one statement; dies when it misses a row `where.id` names. */
    readonly delete: (where: AttachmentEntityWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/attachment/AttachmentRepository', {
  make: Db.useSync((db) => {
    const selectMany = Effect.fn('AttachmentRepository.selectMany')(
      (where: AttachmentEntityWhere) =>
        db
          .select()
          .from(attachments)
          .where(encodeWhere(where))
          .orderBy(attachments.createdAt, attachments.id),
      orDieWithSqlError,
    )

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
            .pipe(orDieUnless(hasRowPer(where.id), 'an attachment named was not updated')),
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
            .pipe(orDieUnless(hasRowPer(where.id), 'an attachment named was not deleted')),
        orDieWithSqlError,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
