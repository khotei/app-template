import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import { Array as Arr, Context, Effect, Layer, Schema } from 'effect'
import type { Prompt } from 'effect/ai'

import { llmModels } from '@app-template/kernel/config'
import { askModel } from '@app-template/kernel/llm'
import { LlmError } from '@app-template/kernel/llm/error'

import { AssistantReply } from '#chat/domain/assistant.model'
import type { MessageFields } from '#chat/domain/message.model'

/** Fixed for every request: a date or user data here would break the cached prefix. */
const systemPrompt = [
  'You are the assistant of a chat app. Answer the last user message, using the whole conversation as context.',
  'Reply in the language of the last user message.',
  'Be accurate and direct. When you do not know something or cannot help, say so plainly instead of guessing.',
].join('\n')

const buildPromptMessage = ({ author, text }: MessageFields): Prompt.MessageEncoded => ({
  role: author,
  content: [{ type: 'text', text }],
})

export class MessageAssistant extends Context.Service<
  MessageAssistant,
  {
    /** The next message of the chat whose finished messages are `history`, oldest first. */
    readonly reply: (
      history: ReadonlyArray<MessageFields>,
    ) => Effect.Effect<AssistantReply, LlmError>
  }
>()('@app-template/application/chat/infrastructure/MessageAssistant', {
  make: Effect.gen(function* () {
    const { replyModel } = yield* llmModels
    const model = yield* AnthropicLanguageModel.make({
      model: replyModel,
      config: { system: systemPrompt, max_tokens: 16_000, cache_control: { type: 'ephemeral' } },
    })

    // Decoded after the call's retries, a blank reply is not asked again: it would most likely recur.
    const reply = Effect.fn('MessageAssistant.reply')(
      (history: ReadonlyArray<MessageFields>) =>
        model.generateText({ prompt: Arr.map(history, buildPromptMessage) }),
      askModel,
      Effect.flatMap(({ text }) =>
        Schema.decodeEffect(AssistantReply)({ text }).pipe(
          Effect.mapError(({ message }) => new LlmError({ cause: message })),
        ),
      ),
    )

    return { reply }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
