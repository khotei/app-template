import {
  Array as Arr,
  Deferred,
  Effect,
  Function as Fn,
  Layer,
  type Option,
  Ref,
  UndefinedOr,
} from 'effect'

import type { AssistantError } from '#domain/assistant.error'
import type { AssistantReply } from '#domain/assistant.model'
import {
  Assistant,
  CurrentReplyProvenance,
  type HistoryMessage,
  ReplyProvenance,
} from '#domain/assistant.port'
import type { ChatTitle } from '#domain/chat.model'

export interface AssistantScript {
  readonly reply?: Effect.Effect<AssistantReply, AssistantError>
  readonly suggestTitle?: Effect.Effect<Option.Option<ChatTitle>, AssistantError>
}

/** A call the recording assistant took, with what the caller handed it. */
export type AssistantCall =
  | { readonly method: 'reply'; readonly history: ReadonlyArray<HistoryMessage> }
  | { readonly method: 'suggestTitle'; readonly text: string }

/** An `Assistant` answering from `script`, keeping each call in `calls`; an unscripted call dies. */
export const recordAssistant = (script: AssistantScript) => {
  const calls = Ref.makeUnsafe<ReadonlyArray<AssistantCall>>([])
  const record = (call: AssistantCall) => Ref.update(calls, Arr.append(call))
  const layer = Layer.succeed(
    Assistant,
    Assistant.of({
      reply: (history) =>
        record({ method: 'reply', history }).pipe(
          Effect.andThen(
            UndefinedOr.match(script.reply, {
              onUndefined: () => Effect.die('reply is not scripted'),
              onDefined: Fn.identity,
            }),
          ),
        ),
      suggestTitle: (text) =>
        record({ method: 'suggestTitle', text }).pipe(
          Effect.andThen(
            UndefinedOr.match(script.suggestTitle, {
              onUndefined: () => Effect.die('suggestTitle is not scripted'),
              onDefined: Fn.identity,
            }),
          ),
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

/** The provenance every reply job carries under `CurrentReplyProvenanceTest`. */
export const replyProvenance = new ReplyProvenance({
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  instructionsHash: 'a1b2c3',
})

export const CurrentReplyProvenanceTest = Layer.succeed(CurrentReplyProvenance, replyProvenance)
