import { buildIdSchema } from '#chat/domain/chat.id'

export const AttachmentId = buildIdSchema('AttachmentId')
export type AttachmentId = typeof AttachmentId.Type
