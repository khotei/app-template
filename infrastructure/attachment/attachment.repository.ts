import { and, eq, inArray, isNull } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema, Struct, UndefinedOr } from 'effect'

import {
  type AttachmentId,
  AttachmentRepository,
  type AttachmentSet,
  type AttachmentWhere,
} from '@app-template/domain/attachment'

import {
  AttachmentInsert,
  attachments,
  decodeAttachment,
} from '#infrastructure/attachment/attachment.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeAttachment = Schema.encodeEffect(AttachmentInsert)

const setColumns = {
  messageId: UndefinedOr.map(Option.getOrNull),
} as const satisfies {
  readonly [K in keyof Required<AttachmentSet>]: (value: AttachmentSet[K]) => unknown
}

const whereColumns = {
  id: (ids) => inArray(attachments.id, ids),
  messageId: UndefinedOr.map(
    Option.match({
      onNone: () => isNull(attachments.messageId),
      onSome: (messageId) => eq(attachments.messageId, messageId),
    }),
  ),
} as const satisfies {
  readonly [K in keyof Required<AttachmentWhere>]: (value: AttachmentWhere[K]) => unknown
}

export const AttachmentRepositoryPg = Layer.effect(
  AttachmentRepository,
  Effect.map(Db, (db) =>
    AttachmentRepository.of({
      insert: Effect.fn('AttachmentRepository.insert')(function* (attachment) {
        const row = yield* encodeAttachment(attachment)
        yield* db.insert(attachments).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('AttachmentRepository.update')(function* (set, where) {
        const row = Struct.evolve(Struct.pick(set, Struct.keys(setColumns)), setColumns)
        const conditions = Struct.evolve(
          Struct.pick(where, Struct.keys(whereColumns)),
          whereColumns,
        )

        const rows = yield* db
          .update(attachments)
          .set(row)
          .where(and(...Object.values(conditions)))
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
