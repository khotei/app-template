import { Array as Arr, Effect, Layer, Ref } from 'effect'

import type { AssistantError } from '#chat/domain/assistant.error'
import type { ChatTitle } from '#chat/domain/chat.model'
import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'

/** A `ChatAssistant` answering every title with `suggestTitle`, keeping each text it took. */
export function recordChatAssistant(suggestTitle: Effect.Effect<ChatTitle, AssistantError>) {
  const texts = Ref.makeUnsafe<ReadonlyArray<string>>([])
  const layer = Layer.succeed(ChatAssistant, {
    suggestTitle: (text) => Ref.update(texts, Arr.append(text)).pipe(Effect.andThen(suggestTitle)),
  })
  return { texts: Ref.get(texts), layer }
}
