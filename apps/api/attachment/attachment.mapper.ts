import type { Attachment } from '@app-template/application/chat'
import type { ApiAttachment } from '@app-template/http-api'

export const buildApiAttachment = (attachment: Attachment): ApiAttachment => attachment
