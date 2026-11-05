import type { Chat, Message } from '@app-template/application/chat'
import type { ApiChat, ApiMessage } from '@app-template/http-api'

export const buildApiChat = (chat: Chat): ApiChat => chat

export const buildApiMessage = (message: Message): ApiMessage => message
