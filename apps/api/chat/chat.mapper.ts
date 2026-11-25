import { type Chat, ChatState } from '@app-template/application/chat'

import type { ApiChat } from '#api/chat/chat.http'

/** A chat on the wire: its fields with the status its newest Run gives it. */
export const buildApiChat = (chat: Chat): ApiChat => ({
  ...chat,
  status: ChatState.build(chat.run),
})
