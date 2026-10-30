import { Layer } from 'effect'

import { AssistantLlm } from '#infrastructure/chat/assistant.llm'
import { AssistantModels } from '#infrastructure/chat/assistant-models.client'
import { ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryPg } from '#infrastructure/chat/message.repository'

export * from '#infrastructure/chat/chat.queue'
export * from '#infrastructure/chat/chat.repository'
export * from '#infrastructure/chat/message.repository'

export const ChatPg = Layer.mergeAll(ChatRepositoryPg, MessageRepositoryPg)

/** The `Assistant` port on the models `LLM_PROVIDER` names. */
export const AssistantLlmFromConfig = AssistantLlm.pipe(
  Layer.provide(AssistantModels.layerFromConfig),
)
