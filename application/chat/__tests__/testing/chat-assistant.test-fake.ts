import { Array as Arr, Effect, Layer, Ref } from 'effect'

import type { LlmError } from '@app-template/kernel/llm/model'

import type { ChatTitle } from '#chat/domain/chat.model'
import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'

/** A `ChatAssistant` returning `title` for every call, keeping each text it took. */
export function recordChatAssistant(title: Effect.Effect<ChatTitle, LlmError>) {
  const texts = Ref.makeUnsafe<ReadonlyArray<string>>([])
  const layer = Layer.succeed(ChatAssistant, {
    proposeTitle: (text) => Ref.update(texts, Arr.append(text)).pipe(Effect.andThen(title)),
  })
  return { texts: Ref.get(texts), layer }
}
