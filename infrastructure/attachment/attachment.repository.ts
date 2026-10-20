import { Effect, Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  Attachment,
  type AttachmentId,
  AttachmentRepository,
} from '@app-template/domain/attachment'

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
