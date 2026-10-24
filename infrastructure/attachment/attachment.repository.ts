import { eq, inArray } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  Attachment,
  type AttachmentId,
  AttachmentRepository,
} from '@app-template/domain/attachment'

import {
  AttachmentInsert,
  attachments,
  decodeAttachment,
} from '#infrastructure/attachment/attachment.entity'
import { Db, orDieWithSqlError } from '#infrastructure/db/db.client'
import { createCollection } from '#infrastructure/kv/kv-collection'

export const AttachmentRepositoryKv = Layer.effect(
  AttachmentRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const attachments = createCollection(store, { prefix: 'attachments/', schema: Attachment })
    return AttachmentRepository.of({
      insert: Effect.fn('AttachmentRepository.insert')((attachment: Attachment) =>
        attachments.set(attachment.id, attachment),
      ),
      update: Effect.fn('AttachmentRepository.update')((attachment: Attachment) =>
        attachments.update(attachment.id, () => attachment),
      ),
      selectById: Effect.fn('AttachmentRepository.selectById')(attachments.get),
      selectByIds: Effect.fn('AttachmentRepository.selectByIds')(attachments.getMany),
      deleteByIds: Effect.fn('AttachmentRepository.deleteByIds')(
        (ids: ReadonlyArray<AttachmentId>) =>
          Effect.forEach(ids, attachments.delete, { discard: true }),
      ),
    })
  }),
)

const encodeAttachment = Schema.encodeEffect(AttachmentInsert)

export const AttachmentRepositoryPg = Layer.effect(
  AttachmentRepository,
  Effect.map(Db, (db) =>
    AttachmentRepository.of({
      insert: Effect.fn('AttachmentRepository.insert')(function* (attachment) {
        const row = yield* encodeAttachment(attachment)
        yield* db.insert(attachments).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('AttachmentRepository.update')(function* (attachment) {
        const row = yield* encodeAttachment(attachment)
        yield* db.update(attachments).set(row).where(eq(attachments.id, attachment.id))
      }, orDieWithSqlError),
      selectById: Effect.fn('AttachmentRepository.selectById')(function* (id) {
        const rows = yield* db.select().from(attachments).where(eq(attachments.id, id)).limit(1)
        return yield* Effect.transposeOption(Option.map(Arr.head(rows), decodeAttachment))
      }, orDieWithSqlError),
      selectByIds: Effect.fn('AttachmentRepository.selectByIds')(function* (ids) {
        const rows = yield* db.select().from(attachments).where(inArray(attachments.id, ids))
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
