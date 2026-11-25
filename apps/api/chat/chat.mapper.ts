import { type Chat, ChatState } from '@app-template/application/chat'
import type { ApiChat } from '@app-template/application/http-api'

/** A chat on the wire: its fields with the state its newest Run gives it. */
export const buildApiChat = (chat: Chat): ApiChat => ({
  ...chat,
  state: ChatState.build(chat.run),
})
