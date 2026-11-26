import { Array as Arr, Effect, Layer, Ref } from 'effect'

import type { LlmError } from '@app-template/kernel/llm/error'

import type { AssistantReply } from '#chat/domain/assistant.model'
import type { ChatContext } from '#chat/domain/chat-context.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'

/**
 * A `MessageAssistant` returning `reply` for every call, keeping each context it took, its tokens
 * limit `contextTokensLimit`, which no context of a case reaches unless the case sets it.
 */
export function recordMessageAssistant(
  reply: Effect.Effect<AssistantReply, LlmError>,
  contextTokensLimit = 1_000_000,
) {
  const contexts = Ref.makeUnsafe<ReadonlyArray<ChatContext>>([])
  const layer = Layer.succeed(MessageAssistant, {
    contextTokensLimit,
    reply: (context) => Ref.update(contexts, Arr.append(context)).pipe(Effect.andThen(reply)),
  })
  return { contexts: Ref.get(contexts), layer }
}
