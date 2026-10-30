import { Array as Arr, Deferred, Effect, Layer, type Option, Ref } from 'effect'

import type { AssistantError } from '#domain/chat/assistant.error'
import type { AssistantReply } from '#domain/chat/assistant.model'
import { Assistant, type HistoryMessage } from '#domain/chat/assistant.port'
import type { ChatTitle } from '#domain/chat/chat.model'
import { provenance } from '#domain/testing/chat.test-fixture'

export interface AssistantScript {
  readonly reply?: Effect.Effect<AssistantReply, AssistantError>
  readonly suggestTitle?: Effect.Effect<Option.Option<ChatTitle>, AssistantError>
}

/** A call the recording assistant took, with what the caller handed it. */
export type AssistantCall =
  | { readonly method: 'reply'; readonly history: ReadonlyArray<HistoryMessage> }
  | { readonly method: 'suggestTitle'; readonly text: string }

/**
 * An `Assistant` answering from `script` with `provenance` as its `replyProvenance`, keeping each
 * call in `calls`; an unscripted call dies.
 */
export const recordAssistant = (script: AssistantScript) => {
  const calls = Ref.makeUnsafe<ReadonlyArray<AssistantCall>>([])
  const record = (call: AssistantCall) => Ref.update(calls, Arr.append(call))
  const layer = Layer.succeed(
    Assistant,
    Assistant.of({
      replyProvenance: provenance,
      reply: (history) =>
        record({ method: 'reply', history }).pipe(
          Effect.andThen(script.reply ?? Effect.die('reply is not scripted')),
        ),
      suggestTitle: (text) =>
        record({ method: 'suggestTitle', text }).pipe(
          Effect.andThen(script.suggestTitle ?? Effect.die('suggestTitle is not scripted')),
        ),
    }),
  )
  return { calls: Ref.get(calls), layer }
}

/**
 * A pause for a scripted assistant call: `hold` signals `asked`, then waits for `release`, so a
 * test acts between a flow's call to the assistant and its answer.
 */
export const holdAssistantCall = () => {
  const asked = Deferred.makeUnsafe<void>()
  const released = Deferred.makeUnsafe<void>()
  return {
    hold: Deferred.succeed(asked, undefined).pipe(Effect.andThen(Deferred.await(released))),
    asked: Deferred.await(asked),
    release: Deferred.succeed(released, undefined),
  }
}

export type AssistantCallHold = ReturnType<typeof holdAssistantCall>
