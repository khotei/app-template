import { Array as Arr, Effect, Layer, Ref } from 'effect'

import type { LlmError } from '@app-template/kernel/llm/model'

import { ChatTitle } from '#chat/domain/chat.model'
import type { ContextMessage } from '#chat/domain/message.model'
import { type AssistantReply, ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'
import { sureReply } from '#testing/chat/chat.test-fixture'

/**
 * A `ChatAssistant` returning `reply` for every reply, `summary` for every summary and `title` for
 * every title, keeping the messages it took for a reply or a summary and each text it took for a
 * title.
 */
export function recordChatAssistant({
  reply = Effect.succeed(sureReply),
  summary = Effect.succeed('A summary.'),
  title = Effect.succeed(ChatTitle.make('A title')),
}: {
  readonly reply?: Effect.Effect<AssistantReply, LlmError>
  readonly summary?: Effect.Effect<string, LlmError>
  readonly title?: Effect.Effect<ChatTitle, LlmError>
} = {}) {
  const contexts = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<ContextMessage>>>([])
  const summarised = Ref.makeUnsafe<ReadonlyArray<ReadonlyArray<ContextMessage>>>([])
  const texts = Ref.makeUnsafe<ReadonlyArray<string>>([])
  const layer = Layer.succeed(ChatAssistant, {
    reply: (context) => Ref.update(contexts, Arr.append(context)).pipe(Effect.andThen(reply)),
    summarise: (context) =>
      Ref.update(summarised, Arr.append(context)).pipe(Effect.andThen(summary)),
    proposeTitle: (text) => Ref.update(texts, Arr.append(text)).pipe(Effect.andThen(title)),
  })
  return {
    contexts: Ref.get(contexts),
    summarised: Ref.get(summarised),
    texts: Ref.get(texts),
    layer,
  }
}
