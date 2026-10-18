import { Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { Attachment, AttachmentRepository } from '@app-template/domain/attachment'

import { createCollection } from '#infrastructure/kv/kv-collection'

export const AttachmentRepositoryKv = Layer.effect(
  AttachmentRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const attachments = createCollection(store, { prefix: 'attachments/', schema: Attachment })
    return AttachmentRepository.of({
      insert: Effect.fn('AttachmentRepository.insert')(function* (attachment) {
        yield* attachments.set(attachment.id, attachment)
      }),
      update: Effect.fn('AttachmentRepository.update')(function* (attachment) {
        yield* attachments.update(attachment.id, () => attachment)
      }),
      selectById: Effect.fn('AttachmentRepository.selectById')(function* (id) {
        return yield* attachments.get(id)
      }),
      selectByIds: Effect.fn('AttachmentRepository.selectByIds')(function* (ids) {
        const found = yield* Effect.forEach(ids, (id) => attachments.get(id))
        return found.flatMap(Option.toArray)
      }),
      deleteByIds: Effect.fn('AttachmentRepository.deleteByIds')(function* (ids) {
        yield* Effect.forEach(ids, (id) => attachments.delete(id), { discard: true })
      }),
    })
  }),
)
