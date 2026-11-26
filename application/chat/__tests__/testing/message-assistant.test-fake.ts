import { Array as Arr, Effect, Layer, Ref } from 'effect'

import { LlmError } from '@app-template/kernel/llm/error'

import type { AssistantReply } from '#chat/domain/assistant.model'
import type { ChatContext } from '#chat/domain/chat-context.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'

/** What an assistant's call fails with when its provider is overloaded. */
export const assistantOverloaded = new LlmError({ cause: '529 overloaded' })

/**
 * A `MessageAssistant` returning `reply` for every reply and `summary` for every summary, keeping
 * each context it took for either, its tokens limit `contextTokensLimit`, which no context of a
 * case reaches unless the case sets it.
 */
export function recordMessageAssistant(
  reply: Effect.Effect<AssistantReply, LlmError>,
  {
    contextTokensLimit = 1_000_000,
    summary = Effect.succeed('A summary.'),
  }: {
    readonly contextTokensLimit?: number
    readonly summary?: Effect.Effect<string, LlmError>
  } = {},
) {
  const contexts = Ref.makeUnsafe<ReadonlyArray<ChatContext>>([])
  const summarised = Ref.makeUnsafe<ReadonlyArray<ChatContext>>([])
  const layer = Layer.succeed(MessageAssistant, {
    contextTokensLimit,
    reply: (context) => Ref.update(contexts, Arr.append(context)).pipe(Effect.andThen(reply)),
    summarise: (context) =>
      Ref.update(summarised, Arr.append(context)).pipe(Effect.andThen(summary)),
  })
  return { contexts: Ref.get(contexts), summarised: Ref.get(summarised), layer }
}
