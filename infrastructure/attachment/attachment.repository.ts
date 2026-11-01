import { eq, inArray, isNull } from 'drizzle-orm'
import {
  Array as Arr,
  Effect,
  Filter,
  flow,
  Layer,
  Option,
  pipe,
  Schema,
  UndefinedOr,
} from 'effect'

import { buildSet, buildWhere, orDieOnNoRows, orDieWithSqlError } from '@app-template/db'
import {
  type Attachment,
  type AttachmentId,
  AttachmentRepository,
  type AttachmentSet,
  type AttachmentWhere,
} from '@app-template/domain/attachment'
import { AttachmentEntityInsert, attachments } from '@app-template/kernel/data/attachment'

import { AttachmentFromEntity } from '#infrastructure/attachment/attachment.mapper'
import { Db } from '#infrastructure/db/db.client'

const encodeAttachment = flow(
  Schema.encodeEffect(AttachmentFromEntity),
  Effect.flatMap(Schema.decodeEffect(AttachmentEntityInsert)),
)

const decodeAttachments = Schema.decodeEffect(Schema.Array(AttachmentFromEntity))

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
      Arr.filterMap(
        Filter.fromPredicateOption((id: AttachmentId) =>
          Arr.findFirst(found, (each) => each.id === id),
        ),
      ),
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
