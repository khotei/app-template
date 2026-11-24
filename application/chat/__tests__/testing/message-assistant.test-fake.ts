import { Array as Arr, Effect, Layer, Ref } from 'effect'

import type { LlmError } from '@app-template/kernel/llm/error'

import type { AssistantReply } from '#chat/domain/assistant.model'
import type { Message } from '#chat/domain/message.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'

/** A `MessageAssistant` returning `reply` for every call, keeping each history it took. */
export function recordMessageAssistant(reply: Effect.Effect<AssistantReply, LlmError>) {
  const histories = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<Message>>>([])
  const layer = Layer.succeed(MessageAssistant, {
    reply: (history) => Ref.update(histories, Arr.append(history)).pipe(Effect.andThen(reply)),
  })
  return { histories: Ref.get(histories), layer }
}
