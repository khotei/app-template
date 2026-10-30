import { Layer } from 'effect'

import { AssistantModels } from '#infrastructure/chat/assistant.client'
import { AssistantLlm } from '#infrastructure/chat/assistant.llm'
import { ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryPg } from '#infrastructure/chat/message.repository'

export { CurrentReplyProvenance } from '#infrastructure/chat/assistant.llm'
export * from '#infrastructure/chat/chat.queue'
export * from '#infrastructure/chat/chat.repository'
export * from '#infrastructure/chat/message.repository'

export const ChatPg = Layer.mergeAll(ChatRepositoryPg, MessageRepositoryPg)

/** The `Assistant` port on the models `LLM_PROVIDER` names. */
export const AssistantLlmFromConfig = AssistantLlm.pipe(
  Layer.provide(AssistantModels.layerFromConfig),
)
