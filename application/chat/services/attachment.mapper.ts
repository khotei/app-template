import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { Attachment } from '#chat/domain/attachment.model'

export const encodeAttachment = encodeRowWith(Attachment)

export const decodeAttachment = decodeOptionalWith(Attachment)

export const decodeAttachments = decodeManyWith(Attachment)
