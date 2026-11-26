import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import { Context, Effect, Layer, Schema, SchemaTransformation } from 'effect'

import { llmModels } from '@app-template/kernel/config'
import { askModel } from '@app-template/kernel/llm'
import type { LlmError } from '@app-template/kernel/llm/error'

import { ChatTitle, maxTitleLength } from '#chat/domain/chat.model'

/** The output's limit of a title's request. */
const titleMaxTokens = 1_000

const titleInstruction = `Write a title of at most ${maxTitleLength} characters, in the language of the next message, for a chat that opens with it.`

/** A bare `String`: `Schema.Trim` would send the language model its `expected` text as a description. */
const TitleObject = Schema.Struct({
  title: Schema.String.pipe(Schema.decodeTo(ChatTitle, SchemaTransformation.trim())),
})

export class ChatAssistant extends Context.Service<
  ChatAssistant,
  {
    /**
     * Proposes a title for a chat opened by `text`, which is never blank; an answer that fails the
     * title's schema is asked again, then fails.
     */
    readonly proposeTitle: (text: string) => Effect.Effect<ChatTitle, LlmError>
  }
>()('@app-template/application/chat/infrastructure/ChatAssistant', {
  make: Effect.gen(function* () {
    const { titleModel } = yield* llmModels
    const model = yield* AnthropicLanguageModel.make({
      model: titleModel,
      config: {
        system: titleInstruction,
        max_tokens: titleMaxTokens,
        output_config: { effort: 'low' },
        thinking: { type: 'disabled' },
      },
    })

    const proposeTitle = Effect.fn('ChatAssistant.proposeTitle')(
      (text: string) => model.generateObject({ prompt: text, schema: TitleObject }),
      askModel({ maxTokens: titleMaxTokens }),
      Effect.map(({ value }) => value.title),
    )

    return { proposeTitle }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
