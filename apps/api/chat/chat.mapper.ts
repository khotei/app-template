import { buildChatStatus, type Chat } from '@app-template/application/chat'

import type { ApiChat } from '#api/chat/chat.http'

export const buildApiChat = (chat: Chat): ApiChat => ({ ...chat, status: buildChatStatus(chat) })
