import { Array as Arr, Option, Struct } from 'effect'

import { buildChatStatus, type Chat, type Message, type Run } from '@app-template/application/chat'
import type { ApiChat, ApiMessage, ApiRun } from '@app-template/http-api'

import { buildApiAttachment } from '#api/attachment/attachment.mapper'

const attachments = Arr.map(buildApiAttachment)

export const buildApiChat = (chat: Chat): ApiChat => ({
  ...Struct.evolve(chat, { attachments }),
  status: buildChatStatus(chat),
})

export const buildApiMessage = (message: Message): ApiMessage =>
  Struct.evolve(message, { attachments })

export const buildApiRun = (run: Run): ApiRun =>
  Struct.evolve(run, {
    // The cause is for operators; it never leaves the api.
    failure: Option.map(Struct.pick(['reason', 'message'])),
    userMessage: buildApiMessage,
    assistantMessage: Option.map(buildApiMessage),
  })
