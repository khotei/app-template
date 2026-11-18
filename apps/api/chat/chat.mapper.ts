import { buildChatStatus, type Chat, type Message, type Run } from '@app-template/application/chat'
import type { ApiChat, ApiMessage, ApiRun } from '@app-template/http-api'

export const buildApiChat = (chat: Chat): ApiChat => ({ ...chat, status: buildChatStatus(chat) })

export const buildApiMessage = (message: Message): ApiMessage => message

export const buildApiRun = (run: Run): ApiRun => run
