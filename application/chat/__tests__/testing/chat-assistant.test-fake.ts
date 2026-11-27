import { Array as Arr, Effect, Layer, Ref, UndefinedOr } from 'effect'

import type { LlmError } from '@app-template/kernel/llm/model'

import type { ChatTitle } from '#chat/domain/chat.model'
import type { ContextMessage } from '#chat/domain/message.model'
import { type AssistantReply, ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'

/**
 * A `ChatAssistant` returning `reply` for every reply, `summary` for every summary and `title` for
 * every title, keeping the messages it took for a reply or a summary and each text it took for a
 * title; a method whose answer the case leaves out dies on its first call.
 */
export function recordChatAssistant({
  reply,
  summary,
  title,
}: {
  readonly reply?: Effect.Effect<AssistantReply, LlmError>
  readonly summary?: Effect.Effect<string, LlmError>
  readonly title?: Effect.Effect<ChatTitle, LlmError>
} = {}) {
  const contexts = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<ContextMessage>>>([])
  const summarised = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<ContextMessage>>>([])
  const texts = Ref.makeUnsafe<ReadonlyArray<string>>([])
  const layer = Layer.mock(ChatAssistant, {
    ...UndefinedOr.map(reply, (answer) => ({
      reply: (context: ReadonlyArray<ContextMessage>) =>
        Ref.update(contexts, Arr.append(context)).pipe(Effect.andThen(answer)),
    })),
    ...UndefinedOr.map(summary, (answer) => ({
      summarise: (context: ReadonlyArray<ContextMessage>) =>
        Ref.update(summarised, Arr.append(context)).pipe(Effect.andThen(answer)),
    })),
    ...UndefinedOr.map(title, (answer) => ({
      proposeTitle: (text: string) =>
        Ref.update(texts, Arr.append(text)).pipe(Effect.andThen(answer)),
    })),
  })
  return {
    contexts: Ref.get(contexts),
    summarised: Ref.get(summarised),
    texts: Ref.get(texts),
    layer,
  }
}
