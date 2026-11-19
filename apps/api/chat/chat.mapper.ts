import { Array as Arr, Struct } from 'effect'

import { type Chat, driveChatStatus, type Message, type Run } from '@app-template/application/chat'
import type { ApiChat, ApiMessage, ApiRun } from '@app-template/http-api'

import { buildApiAttachment } from '#api/attachment/attachment.mapper'

const attachments = Arr.map(buildApiAttachment)

export const buildApiChat = (chat: Chat): ApiChat => ({
  ...Struct.evolve(chat, { attachments }),
  status: driveChatStatus(chat.run),
})

export const buildApiMessage = (message: Message): ApiMessage =>
  Struct.evolve(message, { attachments })

export const buildApiRun = (run: Run): ApiRun => run
