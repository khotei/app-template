import { Layer } from 'effect'

import { ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryPg } from '#infrastructure/chat/message.repository'

export * from '#infrastructure/chat/chat.llm'
export * from '#infrastructure/chat/chat.queue'
export * from '#infrastructure/chat/chat.repository'
export * from '#infrastructure/chat/message.repository'

export const ChatPg = Layer.mergeAll(ChatRepositoryPg, MessageRepositoryPg)
