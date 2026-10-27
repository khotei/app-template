import { Array as Arr, Option, Struct } from 'effect'

import type { Attachment as AttachmentModel } from '@app-template/domain/attachment'
import type {
  ChatDetail,
  Chat as ChatModel,
  ChatSummary,
  MessageDetail,
} from '@app-template/domain/chat'
import type * as Wire from '@app-template/http-api'

/**
 * Each projection names the fields that leave the api, so a model field reaches the wire only
 * once its DTO declares it; relying on the encoder to drop `userId` or `cause` would not say so.
 */
export const toChat = (chat: ChatModel): Wire.Chat =>
  Struct.pick(chat, ['id', 'title', 'createdAt', 'updatedAt'])

export const toSummary = ({ chat, activeMessage }: ChatSummary): Wire.ChatSummary => ({
  ...toChat(chat),
  activeMessage: Option.map(activeMessage, Struct.pick(['id', 'stage'])),
})

export const toAttachment = (attachment: AttachmentModel): Wire.Attachment =>
  Struct.pick(attachment, ['id', 'messageId', 'fileName', 'mediaType', 'size', 'createdAt'])

export const toMessage = ({ message, attachments }: MessageDetail): Wire.Message => ({
  ...Struct.pick(message, ['id', 'chatId', 'author', 'stage', 'text', 'createdAt', 'updatedAt']),
  attachments: Arr.map(attachments, toAttachment),
  error: Option.map(message.error, Struct.pick(['reason', 'message'])),
})

export const toDetail = ({ messages, ...summary }: ChatDetail): Wire.ChatDetail => ({
  ...toSummary(summary),
  messages: Arr.map(messages, toMessage),
})
