import { and, inArray, isNull } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Schema } from 'effect'

import { type AttachmentId, AttachmentRepository } from '@app-template/domain/attachment'

import {
  AttachmentInsert,
  attachments,
  decodeAttachment,
} from '#infrastructure/attachment/attachment.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeAttachment = Schema.encodeEffect(AttachmentInsert)

export const AttachmentRepositoryPg = Layer.effect(
  AttachmentRepository,
  Effect.map(Db, (db) =>
    AttachmentRepository.of({
      insert: Effect.fn('AttachmentRepository.insert')(function* (attachment) {
        const row = yield* encodeAttachment(attachment)
        yield* db.insert(attachments).values(row)
      }, orDieWithSqlError),
      bind: Effect.fn('AttachmentRepository.bind')(function* (ids, messageId) {
        const rows = yield* db
          .update(attachments)
          .set({ messageId })
          .where(and(inArray(attachments.id, ids), isNull(attachments.messageId)))
          .returning()
        return yield* Effect.forEach(rows, decodeAttachment)
      }, orDieWithSqlError),
      selectById: Effect.fn('AttachmentRepository.selectById')(function* (id) {
        const row = yield* db.query.attachments.findFirst({ where: { id } })
        return yield* decodeFound(row, decodeAttachment)
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
