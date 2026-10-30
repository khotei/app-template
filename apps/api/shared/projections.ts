import type { MessageDetail } from '@app-template/domain/chat'
import type * as Wire from '@app-template/http-api'

export const toMessage = ({ message, attachments }: MessageDetail): Wire.Message => ({
  ...message,
  attachments,
})
