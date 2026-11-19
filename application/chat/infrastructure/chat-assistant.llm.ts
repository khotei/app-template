import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import { Context, Effect, Layer, Schema, SchemaTransformation } from 'effect'

import { llmModels } from '@app-template/kernel/config'
import { maxTitleLength } from '@app-template/kernel/data'
import { askModel } from '@app-template/kernel/llm'

import type { AssistantError } from '#chat/domain/assistant.error'
import { ChatTitle } from '#chat/domain/chat.model'
import { assistantErrors } from '#chat/infrastructure/assistant.llm'

const titleInstruction = `Write a title of at most ${maxTitleLength} characters, in the language of the next message, for a chat that opens with it.`

/** A bare `String`: `Schema.Trim` would send the model its `expected` text as a description. */
const TitleAnswer = Schema.Struct({
  title: Schema.String.pipe(Schema.decodeTo(ChatTitle, SchemaTransformation.trim())),
})

export class ChatAssistant extends Context.Service<
  ChatAssistant,
  {
    /**
     * A title for a chat opened by `text`, which is never blank; an answer that fails the title's
     * schema is asked again, then fails.
     */
    readonly suggestTitle: (text: string) => Effect.Effect<ChatTitle, AssistantError>
  }
>()('@app-template/application/chat/infrastructure/ChatAssistant', {
  make: Effect.gen(function* () {
    const { titleModel } = yield* llmModels
    const model = yield* AnthropicLanguageModel.make({
      model: titleModel,
      config: {
        system: titleInstruction,
        max_tokens: 1_000,
        output_config: { effort: 'low' },
        thinking: { type: 'disabled' },
      },
    })

    const suggestTitle = Effect.fn('ChatAssistant.suggestTitle')(
      (text: string) => model.generateObject({ prompt: text, schema: TitleAnswer }),
      askModel(assistantErrors),
      Effect.map(({ value }) => value.title),
    )

    return { suggestTitle }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
