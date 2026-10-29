import { Array as Arr, Option, Struct } from 'effect'

import type { Attachment as AttachmentModel } from '@app-template/domain/attachment'
import type {
  Chat as ChatModel,
  ChatWithStatus as ChatWithStatusModel,
  MessageDetail,
} from '@app-template/domain/chat'
import type * as Wire from '@app-template/http-api'

/**
 * Each projection names the fields that leave the api, so a model field reaches the wire only
 * once its DTO declares it; relying on the encoder to drop `userId` or `cause` would not say so.
 */
export const toChat = (chat: ChatModel): Wire.Chat =>
  Struct.pick(chat, ['id', 'title', 'createdAt', 'updatedAt'])

export const toChatWithStatus = (chat: ChatWithStatusModel): Wire.ChatWithStatus =>
  Struct.pick(chat, ['id', 'title', 'status', 'createdAt', 'updatedAt'])

export const toAttachment = (attachment: AttachmentModel): Wire.Attachment =>
  Struct.pick(attachment, ['id', 'messageId', 'fileName', 'mediaType', 'size', 'createdAt'])

export const toMessage = ({ message, attachments }: MessageDetail): Wire.Message => ({
  ...Struct.pick(message, ['id', 'chatId', 'author', 'stage', 'text', 'createdAt', 'updatedAt']),
  attachments: Arr.map(attachments, toAttachment),
  error: Option.map(message.error, Struct.pick(['reason', 'message'])),
})
