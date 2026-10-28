import { eq, inArray, isNull } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema, UndefinedOr } from 'effect'

import {
  type AttachmentId,
  type AttachmentOneWhere,
  AttachmentRepository,
  type AttachmentSet,
  type AttachmentWhere,
} from '@app-template/domain/attachment'

import {
  AttachmentInsert,
  attachments,
  decodeAttachment,
} from '#infrastructure/attachment/attachment.entity'
import { buildSet, buildWhere } from '#infrastructure/db/columns'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeAttachment = Schema.encodeEffect(AttachmentInsert)

const encodeSet = buildSet<AttachmentSet, typeof attachments>({
  messageId: UndefinedOr.map(Option.getOrNull),
})

const encodeWhere = buildWhere<AttachmentWhere>({
  id: (ids) => inArray(attachments.id, ids),
  messageId: UndefinedOr.map(
    Option.match({
      onNone: () => isNull(attachments.messageId),
      onSome: (messageId) => eq(attachments.messageId, messageId),
    }),
  ),
})

const encodeOneWhere = buildWhere<AttachmentOneWhere>({
  id: (id) => eq(attachments.id, id),
  userId: UndefinedOr.map((userId) => eq(attachments.userId, userId)),
})

export const AttachmentRepositoryPg = Layer.effect(
  AttachmentRepository,
  Effect.map(Db, (db) =>
    AttachmentRepository.of({
      insert: Effect.fn('AttachmentRepository.insert')(function* (attachment) {
        const row = yield* encodeAttachment(attachment)
        yield* db.insert(attachments).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('AttachmentRepository.update')(function* (set, where) {
        const rows = yield* db
          .update(attachments)
          .set(encodeSet(set))
          .where(encodeWhere(where))
          .returning()
        return yield* Effect.forEach(rows, decodeAttachment)
      }, orDieWithSqlError),
      selectOne: Effect.fn('AttachmentRepository.selectOne')(function* (where) {
        const rows = yield* db.select().from(attachments).where(encodeOneWhere(where)).limit(1)
        return yield* decodeFound(rows[0], decodeAttachment)
      }, orDieWithSqlError),
      selectByIds: Effect.fn('AttachmentRepository.selectByIds')(function* (ids) {
        const rows = yield* db.query.attachments.findMany({ where: { id: { in: Arr.copy(ids) } } })
        const found = yield* Effect.forEach(rows, decodeAttachment)
        return Arr.getSomes(Arr.map(ids, (id) => Arr.findFirst(found, (each) => each.id === id)))
      }, orDieWithSqlError),
      deleteByIds: Effect.fn('AttachmentRepository.deleteByIds')(
        (ids: ReadonlyArray<AttachmentId>) =>
          db.delete(attachments).where(inArray(attachments.id, ids)),
        orDieWithSqlError,
      ),
    }),
  ),
)
