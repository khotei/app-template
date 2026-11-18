import { eq, inArray } from 'drizzle-orm'
import { Array as Arr, Context, Effect, Layer, type Option, Struct, UndefinedOr } from 'effect'

import {
  buildWhere,
  eqOrIsNull,
  hasRowPer,
  orDieUnless,
  orDieWithSqlError,
} from '@app-template/packages/db'

import {
  type AttachmentEntity,
  type AttachmentEntitySelectWhere,
  type AttachmentEntitySet,
  type AttachmentEntityWhere,
  attachmentSetColumns,
} from '#kernel/data/attachment/attachment.entity'
import { attachments } from '#kernel/data/attachment/attachment.table'
import { Db } from '#kernel/data/db.client'

const encodeWhere = buildWhere<AttachmentEntitySelectWhere>({
  id: UndefinedOr.map((id) => inArray(attachments.id, Arr.ensure(id))),
  userId: UndefinedOr.map((userId) => eq(attachments.userId, userId)),
  messageId: UndefinedOr.map(eqOrIsNull(attachments.messageId)),
  chatId: UndefinedOr.map(eqOrIsNull(attachments.chatId)),
  sourceId: UndefinedOr.map(eqOrIsNull(attachments.sourceId)),
})

export class AttachmentRepository extends Context.Service<
  AttachmentRepository,
  {
    readonly insert: (attachment: AttachmentEntity) => Effect.Effect<void>
    /** Writes `set` where `where` holds, in one statement; dies when it misses a row `where.id` names. */
    readonly update: (set: AttachmentEntitySet, where: AttachmentEntityWhere) => Effect.Effect<void>
    /** The first row `selectMany` reads. */
    readonly selectOne: (
      where: AttachmentEntitySelectWhere,
    ) => Effect.Effect<Option.Option<AttachmentEntity>>
    /** Rows where `where` holds, in creation order. */
    readonly selectMany: (
      where: AttachmentEntitySelectWhere,
    ) => Effect.Effect<ReadonlyArray<AttachmentEntity>>
    /** Deletes the rows where `where` holds, in one statement; dies when it misses a row `where.id` names. */
    readonly delete: (where: AttachmentEntityWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/attachment/AttachmentRepository', {
  make: Db.useSync((db) => {
    const selectMany = Effect.fn('AttachmentRepository.selectMany')(
      (where: AttachmentEntitySelectWhere) =>
        db
          .select()
          .from(attachments)
          .where(encodeWhere(where))
          .orderBy(attachments.createdAt, attachments.id),
      orDieWithSqlError,
    )

    return {
      insert: Effect.fn('AttachmentRepository.insert')(
        (attachment: AttachmentEntity) =>
          db.insert(attachments).values(attachment).pipe(Effect.asVoid),
        orDieWithSqlError,
      ),
      update: Effect.fn('AttachmentRepository.update')(
        (set: AttachmentEntitySet, where: AttachmentEntityWhere) =>
          db
            .update(attachments)
            .set(Struct.pick(set, attachmentSetColumns))
            .where(encodeWhere(where))
            .returning({ id: attachments.id })
            .pipe(orDieUnless(hasRowPer(where.id), 'an attachment named was not updated')),
        orDieWithSqlError,
      ),
      selectOne: (where: AttachmentEntitySelectWhere) =>
        selectMany(where).pipe(Effect.map(Arr.head)),
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
