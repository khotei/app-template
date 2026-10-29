import { Array as Arr, Deferred, Effect, Layer, type Option, Ref, Stream } from 'effect'

import { Assistant, type AssistantTurn } from '#domain/chat/assistant.port'
import type { ChatTitle } from '#domain/chat/chat.model'

export interface AssistantScript {
  readonly streamText?: Stream.Stream<string>
  readonly suggestTitle?: Effect.Effect<Option.Option<ChatTitle>>
}

/** A call the recording assistant took, with what the caller handed it. */
export type AssistantCall =
  | { readonly method: 'streamText'; readonly history: ReadonlyArray<AssistantTurn> }
  | { readonly method: 'suggestTitle'; readonly text: string }

/** An `Assistant` answering from `script`, keeping each call in `calls`; an unscripted call dies. */
export const recordAssistant = (script: AssistantScript) => {
  const calls = Ref.makeUnsafe<ReadonlyArray<AssistantCall>>([])
  const record = (call: AssistantCall) => Ref.update(calls, Arr.append(call))
  const layer = Layer.succeed(
    Assistant,
    Assistant.of({
      streamText: (history) =>
        Stream.fromEffect(record({ method: 'streamText', history })).pipe(
          Stream.flatMap(() => script.streamText ?? Stream.die('streamText is not scripted')),
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
