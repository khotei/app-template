import { Array as Arr, Deferred, Effect, Layer, Ref } from 'effect'

import type { LlmError } from '@app-template/kernel/llm/error'

import type { AssistantReply, HistoryMessage } from '#chat/domain/assistant.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'

/** A `MessageAssistant` answering every reply with `reply`, keeping each history it took. */
export function recordMessageAssistant(reply: Effect.Effect<AssistantReply, LlmError>) {
  const histories = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<HistoryMessage>>>([])
  const layer = Layer.succeed(MessageAssistant, {
    reply: (history) => Ref.update(histories, Arr.append(history)).pipe(Effect.andThen(reply)),
  })
  return { histories: Ref.get(histories), layer }
}

/**
 * A pause for a scripted reply: `hold` signals `asked`, then waits for `release`, so a test acts
 * between a flow's call to the assistant and its answer.
 */
export function holdAssistantCall() {
  const asked = Deferred.makeUnsafe<void>()
  const released = Deferred.makeUnsafe<void>()
  return {
    hold: Deferred.succeed(asked, undefined).pipe(Effect.andThen(Deferred.await(released))),
    asked: Deferred.await(asked),
    release: Deferred.succeed(released, undefined),
  }
}
