import { eq, inArray, isNull } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, pipe, Schema, UndefinedOr } from 'effect'

import {
  type Attachment,
  type AttachmentId,
  AttachmentRepository,
  type AttachmentSet,
  type AttachmentWhere,
} from '@app-template/domain/attachment'

import {
  AttachmentFromRow,
  AttachmentInsert,
  attachments,
} from '#infrastructure/attachment/attachment.entity'
import { buildSet, buildWhere, skipUndefined } from '#infrastructure/db/columns'
import { Db, decodeOptionalRow, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeAttachment = Schema.encodeEffect(AttachmentInsert)

const decodeAttachments = Schema.decodeEffect(Schema.Array(AttachmentFromRow))

const encodeSet = buildSet<AttachmentSet, typeof attachments>({
  messageId: UndefinedOr.map(Option.getOrNull),
  chatId: UndefinedOr.map(Option.getOrNull),
})

const encodeWhere = buildWhere<AttachmentWhere>({
  id: UndefinedOr.map((ids) => inArray(attachments.id, ids)),
  userId: UndefinedOr.map((userId) => eq(attachments.userId, userId)),
  messageId: UndefinedOr.map(
    Option.match({
      onNone: () => isNull(attachments.messageId),
      onSome: (messageId) => eq(attachments.messageId, messageId),
    }),
  ),
  chatId: UndefinedOr.map((chatId) => eq(attachments.chatId, chatId)),
})

/** The rows in the order of `ids`; without `ids`, as the database returned them. */
const inOrderOf =
  (ids: ReadonlyArray<AttachmentId> | undefined) =>
  (found: ReadonlyArray<Attachment>): ReadonlyArray<Attachment> =>
    ids === undefined
      ? found
      : pipe(
          ids,
          Arr.map((id) => Arr.findFirst(found, (each) => each.id === id)),
          Arr.getSomes,
        )

export const AttachmentRepositoryPg = Layer.effect(
  AttachmentRepository,
  Db.useSync((db) =>
    AttachmentRepository.of({
      insert: Effect.fn('AttachmentRepository.insert')(function* (attachment) {
        const row = yield* encodeAttachment(attachment)
        yield* db.insert(attachments).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('AttachmentRepository.update')(
        (set, where) =>
          db
            .update(attachments)
            .set(encodeSet(set))
            .where(encodeWhere(where))
            .returning()
            .pipe(Effect.flatMap(decodeAttachments)),
        orDieWithSqlError,
      ),
      selectOne: Effect.fn('AttachmentRepository.selectOne')(
        (where) =>
          db.query.attachments
            .findFirst({ where: { id: where.id, userId: skipUndefined(where.userId) } })
            .pipe(Effect.flatMap(decodeOptionalRow(AttachmentFromRow))),
        orDieWithSqlError,
      ),
      selectMany: Effect.fn('AttachmentRepository.selectMany')(
        (where) =>
          db
            .select()
            .from(attachments)
            .where(encodeWhere(where))
            .pipe(Effect.flatMap(decodeAttachments), Effect.map(inOrderOf(where.id))),
        orDieWithSqlError,
      ),
      delete: Effect.fn('AttachmentRepository.delete')(
        (where) =>
          db
            .delete(attachments)
            .where(encodeWhere(where))
            .returning()
            .pipe(Effect.flatMap(decodeAttachments)),
        orDieWithSqlError,
      ),
    }),
  ),
)
