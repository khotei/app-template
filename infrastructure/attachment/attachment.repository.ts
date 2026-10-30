import { eq, inArray, isNull } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, pipe, Schema, UndefinedOr } from 'effect'

import {
  type Attachment,
  AttachmentRepository,
  type AttachmentSet,
  type AttachmentWhere,
} from '@app-template/domain/attachment'

import {
  AttachmentFromRow,
  AttachmentInsert,
  attachments,
} from '#infrastructure/attachment/attachment.entity'
import { buildSet, buildWhere } from '#infrastructure/db/columns'
import { Db, orDieOnNoRows, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeAttachment = Schema.encodeEffect(AttachmentInsert)

const decodeAttachments = Schema.decodeEffect(Schema.Array(AttachmentFromRow))

const encodeSet = buildSet<AttachmentSet, typeof attachments>({
  messageId: UndefinedOr.map(Option.getOrNull),
  chatId: UndefinedOr.map(Option.getOrNull),
})

const encodeWhere = buildWhere<AttachmentWhere>({
  id: (id) => inArray(attachments.id, Arr.ensure(id)),
  userId: UndefinedOr.map((userId) => eq(attachments.userId, userId)),
  messageId: UndefinedOr.map(
    Option.match({
      onNone: () => isNull(attachments.messageId),
      onSome: (messageId) => eq(attachments.messageId, messageId),
    }),
  ),
})

/** The rows in the order of `ids`, one id or a list. */
const inOrderOf =
  (ids: AttachmentWhere['id']) =>
  (found: ReadonlyArray<Attachment>): ReadonlyArray<Attachment> =>
    pipe(
      Arr.ensure(ids),
      Arr.map((id) => Arr.findFirst(found, (each) => each.id === id)),
      Arr.getSomes,
    )

export const AttachmentRepositoryPg = Layer.effect(
  AttachmentRepository,
  Db.useSync((db) => {
    const selectMany = Effect.fn('AttachmentRepository.selectMany')(function* (
      where: AttachmentWhere,
      options?: { readonly forUpdate?: boolean },
    ) {
      const query = db.select().from(attachments).where(encodeWhere(where)).$dynamic()
      const rows = yield* options?.forUpdate ? query.for('update') : query
      return yield* decodeAttachments(rows).pipe(Effect.map(inOrderOf(where.id)))
    }, orDieWithSqlError)

    return AttachmentRepository.of({
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
            .returning({ id: attachments.id })
            .pipe(orDieOnNoRows('no attachment was updated')),
        orDieWithSqlError,
      ),
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
      delete: Effect.fn('AttachmentRepository.delete')(
        (where) =>
          db
            .delete(attachments)
            .where(encodeWhere(where))
            .returning({ id: attachments.id })
            .pipe(orDieOnNoRows('no attachment was deleted')),
        orDieWithSqlError,
      ),
    })
  }),
)
