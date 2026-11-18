import { Schema } from 'effect'

import { decodeRowWith, encodeRowWith } from '@app-template/packages/db'

import { Attachment } from '#chat/domain/attachment.model'

export const encodeAttachment = encodeRowWith(Attachment)

export const decodeAttachment = decodeRowWith(Schema.Option(Attachment))

export const decodeAttachments = decodeRowWith(Schema.Array(Attachment))
