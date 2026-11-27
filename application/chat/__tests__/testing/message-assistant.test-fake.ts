import { Array as Arr, Effect, Layer, Ref } from 'effect'

import type { LlmError } from '@app-template/kernel/llm/model'

import type { ContextMessage } from '#chat/domain/message.model'
import { type AssistantReply, MessageAssistant } from '#chat/infrastructure/message-assistant.llm'

/**
 * A `MessageAssistant` returning `reply` for every reply and `summary` for every summary, keeping
 * the messages it took for either.
 */
export function recordMessageAssistant(
  reply: Effect.Effect<AssistantReply, LlmError>,
  {
    summary = Effect.succeed('A summary.'),
  }: {
    readonly summary?: Effect.Effect<string, LlmError>
  } = {},
) {
  const contexts = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<ContextMessage>>>([])
  const summarised = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<ContextMessage>>>([])
  const layer = Layer.succeed(MessageAssistant, {
    reply: (context) => Ref.update(contexts, Arr.append(context)).pipe(Effect.andThen(reply)),
    summarise: (context) =>
      Ref.update(summarised, Arr.append(context)).pipe(Effect.andThen(summary)),
  })
  return { contexts: Ref.get(contexts), summarised: Ref.get(summarised), layer }
}
