import { buildChatStatus, type Chat } from '@app-template/application/chat'
import type { ApiChat } from '@app-template/http-api'

export const buildApiChat = (chat: Chat): ApiChat => ({ ...chat, status: buildChatStatus(chat) })
