import { Deferred, Effect, Layer, type Option, Stream } from 'effect'

import { Assistant, type AssistantTurn } from '#domain/chat/assistant.port'
import type { ChatTitle } from '#domain/chat/chat.model'

export interface AssistantScript {
  readonly streamText?: Stream.Stream<string>
  readonly suggestTitle?: Effect.Effect<Option.Option<ChatTitle>>
}

export type AssistantCall =
  | { readonly method: 'streamText'; readonly history: ReadonlyArray<AssistantTurn> }
  | { readonly method: 'suggestTitle'; readonly text: string }

/** An assistant answering from `script`, recording every call; an unscripted call dies. */
export const recordAssistant = (script: AssistantScript) => {
  const calls: Array<AssistantCall> = []
  const layer = Layer.succeed(
    Assistant,
    Assistant.of({
      streamText: (history) => {
        calls.push({ method: 'streamText', history })
        return script.streamText ?? Stream.die('streamText is not scripted')
      },
      suggestTitle: (text) => {
        calls.push({ method: 'suggestTitle', text })
        return script.suggestTitle ?? Effect.die('suggestTitle is not scripted')
      },
    }),
  )
  return { calls, layer }
}

/**
 * A pause for a scripted assistant call: `hold` signals `asked`, then waits for `release`, so a
 * test acts between the call to the assistant and its answer.
 */
export const holdAssistantCall = () => {
  const asked = Deferred.makeUnsafe<void>()
  const released = Deferred.makeUnsafe<void>()
  return {
    hold: Effect.andThen(Deferred.succeed(asked, undefined), Deferred.await(released)),
    asked: Deferred.await(asked),
    release: Deferred.succeed(released, undefined),
  }
}

export type AssistantCallHold = ReturnType<typeof holdAssistantCall>
