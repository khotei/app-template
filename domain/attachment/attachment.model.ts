import { Schema } from 'effect'

export const AttachmentId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('AttachmentId'))
export type AttachmentId = typeof AttachmentId.Type
