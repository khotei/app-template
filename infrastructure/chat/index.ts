import { Layer } from 'effect'

import { ChatRepositoryKv } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryKv } from '#infrastructure/chat/message.repository'

export * from '#infrastructure/chat/chat.llm'
export * from '#infrastructure/chat/chat.queue'
export * from '#infrastructure/chat/chat.repository'
export * from '#infrastructure/chat/message.repository'

/** Every adapter of the chat aggregate on `KeyValueStore`. */
export const ChatKv = Layer.mergeAll(ChatRepositoryKv, MessageRepositoryKv)
