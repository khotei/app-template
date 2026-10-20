import { Layer } from 'effect'

import { AttachmentRepositoryKv } from '#infrastructure/attachment/attachment.repository'
import { AttachmentStoreKv } from '#infrastructure/attachment/attachment.storage'

export * from '#infrastructure/attachment/attachment.repository'
export * from '#infrastructure/attachment/attachment.storage'

/** Every adapter of the attachment aggregate on `KeyValueStore`. */
export const AttachmentKv = Layer.mergeAll(AttachmentRepositoryKv, AttachmentStoreKv)
