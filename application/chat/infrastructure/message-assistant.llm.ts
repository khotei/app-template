import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import { Array as Arr, Context, Effect, Layer, Option, Schema } from 'effect'
import type { Prompt } from 'effect/ai'

import { llmModels } from '@app-template/kernel/config'
import { askModel } from '@app-template/kernel/llm'
import { LlmError } from '@app-template/kernel/llm/error'

import { AssistantReply } from '#chat/domain/assistant.model'
import type { Message } from '#chat/domain/message.model'

/** Fixed for every request: a date or user data here would break the cached prefix. */
const systemPrompt = [
  'You are the assistant of a chat app. Answer the last user message, using the whole conversation as context.',
  'Reply in the language of the last user message.',
  'Be accurate and direct. When you do not know something or cannot help, say so plainly instead of guessing.',
].join('\n')

const buildPromptMessage = ({ author, text }: Message): Prompt.MessageEncoded => ({
  role: author,
  content: [{ type: 'text', text }],
})

export class MessageAssistant extends Context.Service<
  MessageAssistant,
  {
    /** The next message of the chat whose finished messages are `history`, oldest first. */
    readonly reply: (history: ReadonlyArray<Message>) => Effect.Effect<AssistantReply, LlmError>
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
      (history: ReadonlyArray<Message>) =>
        model.generateText({ prompt: Arr.map(history, buildPromptMessage) }),
      askModel,
      // The usage as the provider counted it; a count or the name it left out fails the decode.
      Effect.map(({ text, usage, content }) => ({
        text,
        usage: {
          model: Arr.findFirst(content, (part) => part.type === 'response-metadata').pipe(
            Option.flatMapNullishOr((part) => part.modelId),
            Option.getOrUndefined,
          ),
          promptTokens: usage.inputTokens.total,
          outputTokens: usage.outputTokens.total,
          cacheReadTokens: usage.inputTokens.cacheRead,
          cacheWriteTokens: usage.inputTokens.cacheWrite,
        },
      })),
      Effect.flatMap(Schema.decodeUnknownEffect(AssistantReply)),
      Effect.catchTag('SchemaError', ({ message }) =>
        Effect.fail(new LlmError({ cause: message })),
      ),
    )

    return { reply }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
