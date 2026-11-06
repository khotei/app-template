import { Array as Arr, Struct } from 'effect'

import type { Chat, Message } from '@app-template/application/chat'
import type { ApiChat, ApiMessage } from '@app-template/http-api'

import { buildApiAttachment } from '#api/attachment/attachment.mapper'

const attachments = Arr.map(buildApiAttachment)

export const buildApiChat = (chat: Chat): ApiChat => Struct.evolve(chat, { attachments })

export const buildApiMessage = (message: Message): ApiMessage =>
  Struct.evolve(message, { attachments })
