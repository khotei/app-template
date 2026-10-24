import { Layer } from 'effect'

import { ChatRepositoryKv, ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryKv, MessageRepositoryPg } from '#infrastructure/chat/message.repository'

export * from '#infrastructure/chat/chat.llm'
export * from '#infrastructure/chat/chat.queue'
export * from '#infrastructure/chat/chat.repository'
export * from '#infrastructure/chat/message.repository'

export const ChatKv = Layer.mergeAll(ChatRepositoryKv, MessageRepositoryKv)

export const ChatPg = Layer.mergeAll(ChatRepositoryPg, MessageRepositoryPg)
