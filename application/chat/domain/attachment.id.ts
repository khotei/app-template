import { buildIdSchema } from '#chat/domain/id.util'

export const AttachmentId = buildIdSchema('AttachmentId')
export type AttachmentId = typeof AttachmentId.Type
